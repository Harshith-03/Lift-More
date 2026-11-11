import { HttpError, rateLimited } from '../errors';

/**
 * Minimal fetch-based client for Gemini `generateContent` (SPEC §7). Server-side only — the key never
 * leaves this process. JSON mode: `responseMimeType: application/json` + `responseSchema`.
 */

export const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
/**
 * Tried in order after the configured model. We move on when a model 404s (dead id — remembered),
 * or is overloaded / rate-limited / times out (transient — retried first again on the next call).
 * Free-tier quotas are per model, so a sibling model often still has capacity.
 */
// Verified against the live API (Nov 2026): the 2.5 models are closed to new keys; these answer in ~1–3 s
// with minimal thinking. `-latest` aliases go last — they're the most often overloaded.
export const DEFAULT_MODEL = 'gemini-3.5-flash';
export const FALLBACK_MODELS = [DEFAULT_MODEL, 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-flash-latest'];
const TRANSIENT_STATUS = new Set([500, 502, 503, 504]);

/**
 * Short structured coaching replies don't benefit from long reasoning; it only adds latency.
 * Gemini 3+ (and the `-latest` aliases that point at it) take `thinkingLevel`; 2.5 takes `thinkingBudget`.
 */
function thinkingConfigFor(model: string): Record<string, unknown> | undefined {
  if (/^gemini-2\.5-flash/.test(model)) return { thinkingBudget: 0 };
  if (/^gemini-([3-9]|flash-latest|flash-lite-latest)/.test(model)) return { thinkingLevel: 'minimal' };
  return undefined;
}

/** OpenAPI-subset schema understood by Gemini (`type: 'OBJECT' | 'STRING' | ...`). */
export type GeminiSchema = Record<string, unknown>;

export interface GeminiRequest {
  system: string;
  prompt: string;
  schema: GeminiSchema;
  temperature?: number;
}

export interface GeminiResult {
  data: unknown;
  /** The model that actually answered (after any 404 fallback). */
  model: string;
}

export interface GeminiClient {
  readonly models: readonly string[];
  generateJson(req: GeminiRequest): Promise<GeminiResult>;
}

export interface GeminiOptions {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
  /** Per-attempt timeout. */
  timeoutMs?: number;
  /** Budget across all fallback attempts of one call (default 2.5 × timeoutMs). */
  totalTimeoutMs?: number;
  baseUrl?: string;
}

interface GenerateContentResponse {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string; thought?: boolean }> };
    finishReason?: string;
  }>;
  promptFeedback?: { blockReason?: string };
}

export function createGemini(opts: GeminiOptions): GeminiClient {
  const doFetch = opts.fetch ?? globalThis.fetch;
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const totalTimeoutMs = opts.totalTimeoutMs ?? Math.round(timeoutMs * 2.5);
  const base = (opts.baseUrl ?? GEMINI_BASE_URL).replace(/\/+$/, '');
  const models = [...new Set([opts.model, ...FALLBACK_MODELS].filter(Boolean))];
  /** Index of the first model not known to 404 — skips dead ids on later calls. */
  let firstLive = 0;

  /** Models that rejected our thinkingConfig with a 400 — sent without it from then on. */
  const noThinkingConfig = new Set<string>();

  async function callModel(model: string, req: GeminiRequest, attemptTimeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), attemptTimeoutMs);
    const thinkingConfig = noThinkingConfig.has(model) ? undefined : thinkingConfigFor(model);
    try {
      return await doFetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': opts.apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
          systemInstruction: { parts: [{ text: req.system }] },
          generationConfig: {
            temperature: req.temperature ?? 0.4,
            responseMimeType: 'application/json',
            responseSchema: req.schema,
            ...(thinkingConfig ? { thinkingConfig } : {}),
          },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted || (err as Error)?.name === 'AbortError') {
        throw new HttpError(504, 'ai_unavailable', 'The AI coach took too long to respond. Try again.');
      }
      throw new HttpError(502, 'ai_unavailable', 'Could not reach the AI service');
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    models,
    async generateJson(req) {
      const deadline = Date.now() + totalTimeoutMs;
      /** Shortest attempt worth starting; below this we stop and report the last failure. */
      const minAttemptMs = Math.min(3_000, Math.ceil(timeoutMs / 4));
      let lastError: HttpError | undefined;
      for (let i = firstLive; i < models.length; i++) {
        const model = models[i] as string;
        const remaining = deadline - Date.now();
        if (remaining < minAttemptMs) break;
        let res: Response;
        try {
          res = await callModel(model, req, Math.min(timeoutMs, remaining));
          if (res.status === 400 && thinkingConfigFor(model) && !noThinkingConfig.has(model)) {
            // A model that doesn't support our thinking setting: retry once without it, and remember.
            await res.body?.cancel().catch(() => undefined);
            noThinkingConfig.add(model);
            console.warn(`[gemini] ${model} rejected thinkingConfig — retrying without it`);
            res = await callModel(model, req, Math.max(minAttemptMs, Math.min(timeoutMs, deadline - Date.now())));
          }
        } catch (err) {
          // Timeout or network failure: try the next model while budget remains.
          lastError = err instanceof HttpError ? err : new HttpError(502, 'ai_unavailable', 'Could not reach the AI service');
          console.warn(`[gemini] ${model}: ${lastError.message} — trying next model`);
          continue;
        }
        if (res.status === 404) {
          await res.body?.cancel().catch(() => undefined);
          console.warn(`[gemini] model "${model}" not found, trying next fallback`);
          firstLive = Math.min(i + 1, models.length - 1);
          continue;
        }
        if (res.status === 429) {
          const body = await safeJson(res);
          lastError = rateLimited('The AI coach is busy right now. Try again shortly.', retryAfterFrom(res, body));
          console.warn(`[gemini] ${model} rate-limited — trying next model`);
          continue;
        }
        if (TRANSIENT_STATUS.has(res.status)) {
          const text = await res.text().catch(() => '');
          console.warn(`[gemini] ${model} HTTP ${res.status} — trying next model: ${text.slice(0, 200)}`);
          lastError = new HttpError(503, 'ai_unavailable', 'The AI coach is temporarily unavailable. Try again shortly.');
          continue;
        }
        if (!res.ok) {
          // 400/401/403: our request or key is wrong — another model won't fix that.
          const text = await res.text().catch(() => '');
          console.error(`[gemini] ${model} HTTP ${res.status}: ${text.slice(0, 300)}`);
          throw new HttpError(502, 'ai_unavailable', 'The AI coach is temporarily unavailable');
        }
        const body = (await safeJson(res)) as GenerateContentResponse | null;
        return { data: parseCandidate(body), model };
      }
      throw lastError ?? new HttpError(502, 'ai_unavailable', 'No configured Gemini model is available');
    },
  };
}

async function safeJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

function parseCandidate(body: GenerateContentResponse | null): unknown {
  const cand = body?.candidates?.[0];
  if (!cand) {
    const reason = body?.promptFeedback?.blockReason;
    throw new HttpError(502, 'ai_unavailable', reason ? `The AI declined this request (${reason})` : 'Empty AI response');
  }
  const text = (cand.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === 'string')
    .map((p) => p.text)
    .join('');
  if (!text.trim()) {
    throw new HttpError(502, 'ai_unavailable', `Empty AI response${cand.finishReason ? ` (${cand.finishReason})` : ''}`);
  }
  return extractJson(text);
}

/** Tolerant JSON extraction: raw JSON, a ```json fence, or the outermost {...} span. */
export function extractJson(text: string): unknown {
  const t = text.trim();
  const attempts: string[] = [t];
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence?.[1]) attempts.push(fence[1].trim());
  const first = t.indexOf('{');
  const last = t.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(t.slice(first, last + 1));
  for (const a of attempts) {
    try {
      return JSON.parse(a);
    } catch {
      /* try the next shape */
    }
  }
  throw new HttpError(502, 'ai_unavailable', 'The AI returned a response we could not read');
}

/** Retry-After header, else google.rpc.RetryInfo `retryDelay: "17s"`, else 60 s. */
export function retryAfterFrom(res: Response, body: unknown): number {
  const header = res.headers.get('retry-after');
  if (header && Number.isFinite(Number(header))) return Math.max(1, Math.ceil(Number(header)));
  const details = (body as { error?: { details?: Array<Record<string, unknown>> } } | null)?.error?.details ?? [];
  for (const d of details) {
    const delay = d?.retryDelay;
    if (typeof delay === 'string') {
      const m = /^([\d.]+)s$/.exec(delay.trim());
      if (m) return Math.max(1, Math.ceil(Number(m[1])));
    }
  }
  return 60;
}
