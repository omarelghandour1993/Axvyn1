async function translateText(text, sourceLanguage, targetLanguage) {
  const baseUrl = (
    process.env.LIBRETRANSLATE_URL ||
    'https://libretranslate.com'
  ).replace(/\/+$/, '');

  const apiKey = process.env.LIBRETRANSLATE_API_KEY || '';

  const requestBody = {
    q: text,
    source: sourceLanguage,
    target: targetLanguage,
    format: 'text'
  };

  if (apiKey) {
    requestBody.api_key = apiKey;
  }

  const response = await fetch(baseUrl + '/translate', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(requestBody)
  });

  const responseText = await response.text();

  let data;

  try {
    data = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      'LibreTranslate returned an invalid response: ' +
      responseText.substring(0, 300)
    );
  }

  if (!response.ok) {
    throw new Error(
      'LibreTranslate failed with HTTP ' +
      response.status +
      ': ' +
      (data.error || responseText)
    );
  }

  if (!data.translatedText) {
    throw new Error(
      data.error || 'LibreTranslate returned no translated text.'
    );
  }

  return data.translatedText;
}
