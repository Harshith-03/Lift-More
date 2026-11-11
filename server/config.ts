export interface GeminiConfig {
  /** Undefined → AI coach disabled (503 ai_unavailable). */
  apiKey?: string;
  model: string;
  /** Global requests/minute across all users (token bucket). */
  rpm: number;
  /** Per-user AI calls per (UTC) day. */
  userDailyLimit: number;
  /** Per-request timeout. */
  timeoutMs: number;
}

export interface AppConfig {
  isProduction: boolean;
  /** Public origin(s) for the CSRF Origin check, e.g. https://lift-more.onrender.com (comma-separated allowed). */
  appOrigins: string[];
  /** Serve the built SPA from here (production). */
  staticDir?: string;
  gemini: GeminiConfig;
  /** Login brute-force limit per IP. */
  loginRateLimit: { windowMs: number; limit: number };
  /** Sign-up limit per IP (bcrypt hashing is CPU-heavy, so unbounded sign-ups are a DoS vector). */
  registerRateLimit: { windowMs: number; limit: number };
  bcryptCost: number;
  sessionTtlDays: number;
  /** Renew the session when fewer than this many days remain. */
  sessionRenewBelowDays: number;
}

function int(v: string | undefined, fallback: number, min = 1): number {
  const n = Number.parseInt(v ?? '', 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env, overrides: Partial<AppConfig> = {}): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  const apiKey = env.GEMINI_API_KEY?.trim() || undefined;
  const base: AppConfig = {
    isProduction,
    appOrigins: (env.APP_ORIGIN ?? '')
      .split(',')
      .map((s) => s.trim().replace(/\/+$/, ''))
      .filter(Boolean),
    staticDir: undefined,
    gemini: {
      apiKey,
      model: env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash',
      rpm: int(env.GEMINI_RPM, 15),
      userDailyLimit: int(env.GEMINI_USER_DAILY_LIMIT, 30),
      // Per model attempt; one call may fall back through up to 3 models within 2.5× this.
      timeoutMs: 20_000,
    },
    loginRateLimit: { windowMs: 15 * 60 * 1000, limit: 10 },
    registerRateLimit: { windowMs: 60 * 60 * 1000, limit: int(env.REGISTER_RATE_LIMIT, 20) },
    bcryptCost: 10,
    sessionTtlDays: 30,
    sessionRenewBelowDays: 15,
  };
  return { ...base, ...overrides, gemini: { ...base.gemini, ...overrides.gemini } };
}
