const express = require('express');
const multer = require('multer');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: function (req, file, cb) {
    if (!file.originalname.toLowerCase().endsWith('.srt')) {
      return cb(new Error('Only .srt files are allowed.'));
    }
    cb(null, true);
  }
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

async function translateText(text, sourceLanguage, targetLanguage) {
  const url = 'https://libretranslate.com/translate';

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      q: text,
      source: sourceLanguage,
      target: targetLanguage,
      format: 'text'
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error('LibreTranslate failed: ' + response.status + ' ' + errorText);
  }

  const data = await response.json();

  if (!data.translatedText) {
    throw new Error('LibreTranslate returned no translated text.');
  }

  return data.translatedText;
}

async function translateSrtFile(fileBuffer, sourceLanguage, targetLanguage) {
  const content = fileBuffer.toString('utf8');
  const subtitles = parseSrt(content);

  if (!subtitles.length) {
    throw new Error('No valid subtitle blocks were found in the SRT file.');
  }

  const translatedSubtitles = [];

  for (let i = 0; i < subtitles.length; i++) {
    const subtitle = subtitles[i];
    const translatedText = await translateText(
      subtitle.text,
      sourceLanguage,
      targetLanguage
    );

    translatedSubtitles.push({
      number: subtitle.number,
      timing: subtitle.timing,
      text: translatedText
    });
  }

  return buildSrt(translatedSubtitles);
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', function (req, res) {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/api/translate-srt', upload.single('srtFile'), async function (req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please upload an SRT file.' });
    }

    const sourceLanguage = (req.body.sourceLanguage || '').trim();
    const targetLanguage = (req.body.targetLanguage || '').trim();

    if (!sourceLanguage || !targetLanguage) {
      return res.status(400).json({ error: 'Language selection is required.' });
    }

    if (sourceLanguage === targetLanguage) {
      return res.status(400).json({ error: 'Source and target languages must be different.' });
    }

    const outputSrt = await translateSrtFile(
      req.file.buffer,
      sourceLanguage,
      targetLanguage
    );

    const originalName = path.basename(
      req.file.originalname,
      path.extname(req.file.originalname)
    );

    const outputName = originalName + '_' + targetLanguage + '.srt';

    res.setHeader('Content-Type', 'application/x-subrip; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${outputName}"`);
    return res.send(outputSrt);
  } catch (error) {
    console.error('Translation error:', error);
    return res.status(500).json({
      error: error.message || 'Translation failed.'
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
  console.log('Axvyn LibreTranslate server running at http://localhost:' + port);
});
