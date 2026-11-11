import type {
  ApiError,
  BodyweightEntry,
  CoachAskResponse,
  CoachReview,
  CoachStatus,
  CustomExerciseInput,
  Exercise,
  ExerciseHistory,
  ExerciseSession,
  ExportBundle,
  LoginRequest,
  PersonalRecord,
  RegisterRequest,
  Routine,
  RoutineInput,
  StatsSummary,
  User,
  UserSettingsPatch,
  WeeklyPlan,
  Workout,
  WorkoutSummary,
} from '../../../shared/types';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Typed error for every failed request. status 0 = network failure (offline / server unreachable). */
export class ApiRequestError extends Error {
  readonly status: number;
  readonly code: string;
  readonly retryAfterSec: number | undefined;
  readonly details: unknown;

  constructor(status: number, body: Partial<ApiError> & { message: string }) {
    super(body.message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = body.error ?? (status === 0 ? 'network' : 'internal');
    this.retryAfterSec = body.retryAfterSec;
    this.details = body.details;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

export function isApiError(e: unknown): e is ApiRequestError {
  return e instanceof ApiRequestError;
}

/** Network failures, timeouts, rate limits and 5xx are worth retrying later; other 4xx are not. */
export function isRetryable(e: unknown): boolean {
  if (!(e instanceof ApiRequestError)) return true;
  return e.status === 0 || e.status === 408 || e.status === 429 || e.status >= 500;
}

/** Human-friendly message for toasts. */
export function errorMessage(e: unknown, fallback = 'Something went wrong'): string {
  if (e instanceof ApiRequestError) {
    if (e.isNetwork) return "You're offline or the server can't be reached.";
    if (e.code === 'rate_limited' && e.retryAfterSec) return `${e.message} (try again in ${e.retryAfterSec}s)`;
    return e.message || fallback;
  }
  if (e instanceof Error && e.message) return e.message;
  return fallback;
}

let unauthorizedHandler: (() => void) | null = null;
/** Called on any 401 (except requests that opt out, e.g. login). The app drops to the login screen. */
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

interface RequestOptions {
  body?: unknown;
  signal?: AbortSignal;
  /** Don't treat a 401 as "session expired" (login with bad creds, delete-account password check). */
  skipAuthRedirect?: boolean;
}

function parseRetryAfter(h: string | null): number | undefined {
  if (!h) return undefined;
  const n = Number(h);
  if (Number.isFinite(n)) return Math.max(0, Math.ceil(n));
  const t = Date.parse(h);
  return Number.isFinite(t) ? Math.max(0, Math.ceil((t - Date.now()) / 1000)) : undefined;
}

export async function request<T>(method: Method, path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const init: RequestInit = { method, credentials: 'same-origin', headers, signal: opts.signal };
  if (method !== 'GET') {
    headers['Content-Type'] = 'application/json';
    if (opts.body !== undefined) init.body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiRequestError(0, { error: 'network', message: "You're offline or the server can't be reached." });
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text().catch(() => '');
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }

  if (!res.ok) {
    const body = (data && typeof data === 'object' ? data : {}) as Partial<ApiError>;
    const err = new ApiRequestError(res.status, {
      error: body.error ?? (res.status === 401 ? 'unauthorized' : res.status === 404 ? 'not_found' : 'internal'),
      message: body.message ?? (res.statusText || `Request failed (${res.status})`),
      retryAfterSec: body.retryAfterSec ?? parseRetryAfter(res.headers.get('Retry-After')),
      details: body.details,
    });
    if (res.status === 401 && !opts.skipAuthRedirect) unauthorizedHandler?.();
    throw err;
  }
  return data as T;
}

const get = <T>(path: string, signal?: AbortSignal) => request<T>('GET', path, { signal });
const enc = encodeURIComponent;

export interface ImportResult {
  routines: number;
  workouts: number;
  customExercises: number;
  bodyweight: number;
}

export const api = {
  health: () => get<{ ok: true; db: 'postgres' | 'pglite'; ai: boolean }>('/api/health'),

  // auth
  /** Current user, or null when not logged in. */
  me: async (signal?: AbortSignal): Promise<User | null> => {
    try {
      return await request<User>('GET', '/api/auth/me', { signal, skipAuthRedirect: true });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 401) return null;
      throw e;
    }
  },
  login: (body: LoginRequest) => request<User>('POST', '/api/auth/login', { body, skipAuthRedirect: true }),
  register: (body: RegisterRequest) => request<User>('POST', '/api/auth/register', { body, skipAuthRedirect: true }),
  logout: () => request<void>('POST', '/api/auth/logout', { skipAuthRedirect: true }),
  patchMe: (body: UserSettingsPatch) => request<User>('PATCH', '/api/me', { body }),
  deleteMe: (password: string) => request<void>('DELETE', '/api/me', { body: { password }, skipAuthRedirect: true }),

  // exercises
  customExercises: (signal?: AbortSignal) => get<Exercise[]>('/api/exercises/custom', signal),
  createCustomExercise: (body: CustomExerciseInput) => request<Exercise>('POST', '/api/exercises/custom', { body }),
  deleteCustomExercise: (id: string) => request<void>('DELETE', `/api/exercises/custom/${enc(id)}`),

  // routines
  routines: (signal?: AbortSignal) => get<Routine[]>('/api/routines', signal),
  createRoutine: (body: RoutineInput) => request<Routine>('POST', '/api/routines', { body }),
  routinesFromTemplate: (templateId: string, replaceExisting = false) =>
    request<Routine[]>('POST', '/api/routines/from-template', { body: { templateId, replaceExisting } }),
  updateRoutine: (id: string, body: RoutineInput) => request<Routine>('PUT', `/api/routines/${enc(id)}`, { body }),
  reorderRoutines: (ids: string[]) => request<Routine[]>('POST', '/api/routines/reorder', { body: { ids } }),
  deleteRoutine: (id: string) => request<void>('DELETE', `/api/routines/${enc(id)}`),

  // workouts
  workouts: (params: { limit?: number; before?: string } = {}, signal?: AbortSignal) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.before) q.set('before', params.before);
    const qs = q.toString();
    return get<WorkoutSummary[]>(`/api/workouts${qs ? `?${qs}` : ''}`, signal);
  },
  workout: (id: string, signal?: AbortSignal) => get<Workout>(`/api/workouts/${enc(id)}`, signal),
  putWorkout: (w: Workout) =>
    request<{ workout: Workout; prs: PersonalRecord[] }>('PUT', `/api/workouts/${enc(w.id)}`, { body: w }),
  deleteWorkout: (id: string) => request<void>('DELETE', `/api/workouts/${enc(id)}`),

  // history / analytics
  exerciseHistory: (exerciseId: string, limit = 30, signal?: AbortSignal) =>
    get<ExerciseHistory>(`/api/history/exercise/${enc(exerciseId)}?limit=${limit}`, signal),
  lastSessions: (exerciseIds: string[], signal?: AbortSignal) =>
    get<Record<string, ExerciseSession | null>>(
      `/api/history/last?exerciseIds=${exerciseIds.map(enc).join(',')}`,
      signal,
    ),
  stats: (signal?: AbortSignal) => get<StatsSummary>('/api/stats', signal),
  plan: (signal?: AbortSignal) => get<WeeklyPlan>('/api/plan', signal),

  // bodyweight
  bodyweight: (signal?: AbortSignal) => get<BodyweightEntry[]>('/api/bodyweight', signal),
  putBodyweight: (date: string, weightKg: number) =>
    request<BodyweightEntry>('PUT', `/api/bodyweight/${enc(date)}`, { body: { weightKg } }),
  deleteBodyweight: (date: string) => request<void>('DELETE', `/api/bodyweight/${enc(date)}`),

  // AI coach
  coachStatus: (signal?: AbortSignal) => get<CoachStatus>('/api/coach/status', signal),
  /** Latest review for the current week, or null (404 = none yet). */
  coachReview: async (signal?: AbortSignal): Promise<CoachReview | null> => {
    try {
      return await get<CoachReview>('/api/coach/review', signal);
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 404) return null;
      throw e;
    }
  },
  createCoachReview: (force = false) => request<CoachReview>('POST', '/api/coach/review', { body: { force } }),
  coachAsk: (question: string) => request<CoachAskResponse>('POST', '/api/coach/ask', { body: { question } }),

  // data
  exportData: () => get<ExportBundle>('/api/export'),
  importData: (bundle: ExportBundle) => request<ImportResult>('POST', '/api/import', { body: bundle }),
};
