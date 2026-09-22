# Axvyn

This project includes:
- DOCX to PDF
- image compression
- text-to-speech
- SRT translation via Google Cloud Translation
- YouTube subtitle fetch

## Setup

1. Create a Google Cloud service account
2. Enable Cloud Translation API
3. Download the JSON key
4. In Render, add this environment variable:
   GOOGLE_APPLICATION_CREDENTIALS_JSON
5. Paste the full JSON contents as the value

## Run locally

```bash
npm install
npm start
