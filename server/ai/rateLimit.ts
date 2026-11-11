import type { Queryable } from '../db/types';
import { rateLimited } from '../errors';

/**
 * Global token bucket for the Gemini key's per-minute quota (GEMINI_RPM), shared by all users.
 * Continuous refill at `perMinute / 60 s`; an empty bucket rejects immediately (no queueing).
 */
export class TokenBucket {
  private tokens: number;
  private last: number;
  private readonly ratePerMs: number;

  constructor(
    readonly perMinute: number,
    private readonly now: () => Date = () => new Date(),
  ) {
    this.tokens = perMinute;
    this.last = now().getTime();
    this.ratePerMs = perMinute / 60_000;
  }

  private refill() {
    const t = this.now().getTime();
    if (t > this.last) {
      this.tokens = Math.min(this.perMinute, this.tokens + (t - this.last) * this.ratePerMs);
      this.last = t;
    }
  }

  tryTake(): { ok: true } | { ok: false; retryAfterSec: number } {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return { ok: true };
    }
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((1 - this.tokens) / this.ratePerMs / 1000)) };
  }

  get available(): number {
    this.refill();
    return Math.floor(this.tokens);
  }
}

/** Per-user daily counter lives in `ai_usage` keyed by UTC day. */
export function utcDay(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function secondsUntilUtcMidnight(now: Date): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

/** Atomically count one call if the user is under `limit`. false → cap reached. */
export async function reserveDaily(q: Queryable, userId: string, day: string, limit: number): Promise<boolean> {
  if (limit <= 0) return false;
  const rows = await q.query(
    `INSERT INTO ai_usage (user_id, day, count) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, day) DO UPDATE SET count = ai_usage.count + 1
     WHERE ai_usage.count < $3
     RETURNING count`,
    [userId, day, limit],
  );
  return rows.length > 0;
}

export async function refundDaily(q: Queryable, userId: string, day: string): Promise<void> {
  await q.query('UPDATE ai_usage SET count = GREATEST(count - 1, 0) WHERE user_id = $1 AND day = $2', [userId, day]);
}

export async function usedToday(q: Queryable, userId: string, day: string): Promise<number> {
  const rows = await q.query<{ count: number }>('SELECT count FROM ai_usage WHERE user_id = $1 AND day = $2', [
    userId,
    day,
  ]);
  return rows[0] ? Number(rows[0].count) : 0;
}

export interface AiPermit {
  /** Give the daily slot back (the call failed before producing anything useful). */
  refund(): Promise<void>;
}

/** Daily cap first (no global token wasted on a capped user), then the global bucket. */
export class AiGate {
  constructor(
    private readonly db: Queryable,
    readonly bucket: TokenBucket,
    readonly dailyLimit: number,
    private readonly now: () => Date,
  ) {}

  async remaining(userId: string): Promise<number> {
    return Math.max(0, this.dailyLimit - (await usedToday(this.db, userId, utcDay(this.now()))));
  }

  async acquire(userId: string): Promise<AiPermit> {
    const now = this.now();
    const day = utcDay(now);
    if (!(await reserveDaily(this.db, userId, day, this.dailyLimit))) {
      throw rateLimited(
        `You've used all ${this.dailyLimit} AI coach requests for today. They reset at midnight UTC.`,
        secondsUntilUtcMidnight(now),
      );
    }
    const token = this.bucket.tryTake();
    if (!token.ok) {
      await refundDaily(this.db, userId, day);
      throw rateLimited('The AI coach is busy right now. Try again shortly.', token.retryAfterSec);
    }
    let refunded = false;
    return {
      refund: async () => {
        if (refunded) return;
        refunded = true;
        await refundDaily(this.db, userId, day).catch(() => undefined);
      },
    };
  }
}
