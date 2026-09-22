const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { Translate } = require('@google-cloud/translate').v2;

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.toLowerCase().endsWith('.srt')) {
      return cb(new Error('Only .srt files are allowed'));
    }
    cb(null, true);
  }
});

function setupGoogleCredentials() {
  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;

  if (!json) {
    throw new Error(
      'Missing GOOGLE_APPLICATION_CREDENTIALS_JSON. ' +
      'Add the JSON contents of your Google service account in Render env vars.'
    );
  }

  const credentialsPath = path.join(__dirname, 'tmp-google-creds.json');
  fs.writeFileSync(credentialsPath, json, 'utf8');
  process.env.GOOGLE_APPLICATION_CREDENTIALS = credentialsPath;
}

try {
  setupGoogleCredentials();
} catch (error) {
  console.error('Google setup error:', error.message);
}

const translate = new Translate({
  keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS
});

function parseSrt(content) {
  const normalized = content
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim();

  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const subtitles = [];

  for (const block of blocks) {
    const lines = block.split('\n');

    if (lines.length < 3) continue;

    const number = lines[0].trim();
    const timing = lines[1].trim();
    const text = lines.slice(2).join('\n').trim();

    if (!/^\d+$/.test(number)) continue;
    if (!timing.includes('-->')) continue;
    if (!text) continue;

    subtitles.push({
      number,
      timing,
      text
    });
  }

  return subtitles;
}

function buildSrt(subtitles) {
  return subtitles
    .map((subtitle, index) => {
      return String(index + 1) + '\n' + subtitle.timing + '\n' + subtitle.text;
    })
    .join('\n\n') + '\n\n';
}

async function translateBatch(subtitles, sourceLanguage, targetLanguage) {
  const texts = subtitles.map((item) => item.text);

  const [response] = await translate.translate(texts, {
    from: sourceLanguage,
    to: targetLanguage
  });

  return subtitles.map((subtitle, index) => ({
    number: subtitle.number,
    timing: subtitle.timing,
    text: response[index]
  }));
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/translate-srt', upload.single('srtFile'), async function (req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Please upload an .srt file.'
      });
    }

    const sourceLanguage = String(req.body.sourceLanguage || '').trim();
    const targetLanguage = String(req.body.targetLanguage || '').trim();

    if (!sourceLanguage || !targetLanguage) {
      return res.status(400).json({
        error: 'Source and target languages are required.'
      });
    }

    if (sourceLanguage === targetLanguage) {
      return res.status(400).json({
        error: 'Source and target languages must be different.'
      });
    }

    const content = req.file.buffer.toString('utf8');
    const subtitles = parseSrt(content);

    if (!subtitles.length) {
      return res.status(400).json({
        error: 'No valid subtitle blocks were found in the SRT file.'
      });
    }

    const translatedSubtitles = await translateBatch(
      subtitles,
      sourceLanguage,
      targetLanguage
    );

    const translatedSrt = buildSrt(translatedSubtitles);

    const originalName = path.basename(
      req.file.originalname,
      path.extname(req.file.originalname)
    );

    const outputName = originalName + '_' + targetLanguage + '.srt';

    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
    return res.send(translatedSrt);
  } catch (error) {
    console.error('SRT translation failed:', error);
    return res.status(500).json({
      error: error.message || 'Translation failed.'
    });
  }
});

app.get('/api/youtube-subtitles', async function (req, res) {
  try {
    const videoUrl = String(req.query.url || '').trim();
    const lang = String(req.query.lang || 'auto').trim();

    if (!videoUrl) {
      return res.status(400).json({ error: 'Missing YouTube URL' });
    }

    let videoId = null;

    try {
      const parsed = new URL(videoUrl);
      if (parsed.hostname.includes('youtu.be')) {
        videoId = parsed.pathname.replace('/', '');
      } else {
        videoId = parsed.searchParams.get('v');
      }
    } catch (e) {
      return res.status(400).json({ error: 'Invalid YouTube URL' });
    }

    if (!videoId) {
      return res.status(400).json({ error: 'Could not find video ID' });
    }

    const apiUrl =
      'https://youtubetranscript.com/?server_vid2=' +
      encodeURIComponent(videoId) +
      '&lang=' +
      encodeURIComponent(lang);

    const response = await fetch(apiUrl);

    if (!response.ok) {
      return res.status(400).json({
        error: 'Could not fetch subtitles from the video.'
      });
    }

    const text = await response.text();

    if (!text || !text.includes('-->')) {
      return res.status(404).json({
        error: 'No subtitles found for this video and language.'
      });
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${videoId}_${lang}.srt"`
    );

    return res.send(text);
  } catch (error) {
    console.error('YouTube subtitles error:', error);
    return res.status(500).json({
      error: 'Failed to fetch YouTube subtitles.'
    });
  }
});

app.use(function (error, req, res, next) {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: error.message });
  }

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  next();
});

app.listen(port, function () {
  console.log('Axvyn server running on port ' + port);
});
