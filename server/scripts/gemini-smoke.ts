/**
 * Manual live check of the Gemini integration — makes ONE real API call with the key in `.env`.
 *   npx tsx server/scripts/gemini-smoke.ts
 * Not run by tests or CI.
 */
import 'dotenv/config';
import { createGemini } from '../ai/gemini';
import { loadConfig } from '../config';
import { HttpError } from '../errors';

async function main() {
  const { gemini } = loadConfig();
  if (!gemini.apiKey) {
    console.error('GEMINI_API_KEY is not set (.env). Nothing to test.');
    process.exit(1);
  }
  const client = createGemini({ apiKey: gemini.apiKey, model: gemini.model, timeoutMs: gemini.timeoutMs });
  console.log(`Trying models in order: ${client.models.join(' → ')}`);
  const started = Date.now();
  const { data, model } = await client.generateJson({
    system: 'You are a terse gym coach. Reply with JSON only.',
    prompt: 'Give one short tip for adding weight to a bench press. Set ok=true.',
    schema: {
      type: 'OBJECT',
      properties: { ok: { type: 'BOOLEAN' }, tip: { type: 'STRING' } },
      required: ['ok', 'tip'],
    },
  });
  console.log(`Model used: ${model} (${Date.now() - started} ms)`);
  console.log('Response:', JSON.stringify(data, null, 2));
}

main().catch((err) => {
  if (err instanceof HttpError) {
    console.error(`Gemini call failed: ${err.status} ${err.code} — ${err.message}`);
    if (err.extra.retryAfterSec) console.error(`retryAfterSec: ${err.extra.retryAfterSec}`);
  } else {
    console.error('Gemini call failed:', err);
  }
  process.exit(1);
});
