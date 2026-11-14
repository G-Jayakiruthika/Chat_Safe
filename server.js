'use strict';

const { createServer } = require('./src/app');
const { createGeminiClient } = require('./src/gemini');

const port = Number(process.env.PORT) || 8080;
const gemini = createGeminiClient({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL,
});

const server = createServer({ gemini });
server.listen(port, () => {
  console.log(`CALLSAFE listening on :${port} (AI ${gemini.enabled ? `on: ${gemini.model}` : 'off: offline rules only'})`);
});

const shutdown = () => server.close(() => process.exit(0));
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
