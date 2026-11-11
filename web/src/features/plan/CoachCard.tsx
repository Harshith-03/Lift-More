import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Bot, CircleCheck, Lightbulb, RefreshCw, Send, Sparkles, TriangleAlert } from 'lucide-react';
import type { CoachReview } from '../../../../shared/types';
import { api, ApiRequestError, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { useCoachReview, useCoachStatus, useExerciseLookup, useUser } from '../../lib/queries';
import { useCountdown, useOnline } from '../../lib/hooks';
import { fmtClock, fmtShortDate, fmtTime, fmtWeight, plural } from '../../lib/format';
import { Button, Card, Skeleton } from '../../components/ui';
import { useToast } from '../../components/feedback';
import { RecommendationItem } from './RecommendationItem';

type Blocked = { kind: 'unavailable' } | { kind: 'rate'; until: number } | null;

function useCoachErrors() {
  const [blocked, setBlocked] = useState<Blocked>(null);
  const toast = useToast();
  const handle = (e: unknown) => {
    if (e instanceof ApiRequestError && (e.status === 503 || e.code === 'ai_unavailable')) setBlocked({ kind: 'unavailable' });
    else if (e instanceof ApiRequestError && e.status === 429) setBlocked({ kind: 'rate', until: Date.now() + (e.retryAfterSec ?? 60) * 1000 });
    else toast.error(errorMessage(e, 'The coach is unavailable right now'));
  };
  return { blocked, setBlocked, handle };
}

function ReviewBody({ review }: { review: CoachReview }) {
  const user = useUser();
  const lookup = useExerciseLookup();
  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] leading-relaxed">{review.summary}</p>

      {review.wins.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">Wins</h4>
          <ul className="flex flex-col gap-1.5">
            {review.wins.map((w, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <CircleCheck className="mt-0.5 size-4 shrink-0 text-good" aria-hidden />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.concerns.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">Watch out</h4>
          <ul className="flex flex-col gap-1.5">
            {review.concerns.map((c, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" aria-hidden />
                <span>{c}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.adjustments.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">Adjustments</h4>
          <ul className="flex flex-col gap-2">
            {review.adjustments.map((a, i) => (
              <li key={i} className="rounded-2xl bg-surface-2/60 p-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate font-semibold">{lookup.name(a.exerciseId)}</span>
                  <span className="shrink-0 font-bold">
                    {a.weightKg != null ? fmtWeight(a.weightKg, user.unit) : ''}
                    {a.weightKg != null && a.reps != null ? ' × ' : ''}
                    {a.reps != null ? `${a.reps}` : ''}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted">{a.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {review.exerciseChanges.length > 0 && (
        <div>
          <h4 className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">Exercise changes</h4>
          <ul className="flex flex-col gap-2">
            {review.exerciseChanges.map((c, i) => (
              <RecommendationItem key={`${c.type}-${c.exerciseId}-${c.replacementId ?? ''}-${i}`} change={c} />
            ))}
          </ul>
        </div>
      )}

      {review.tip && (
        <p className="flex gap-2 rounded-2xl bg-accent-soft p-3 text-sm">
          <Lightbulb className="mt-0.5 size-4 shrink-0 text-accent-ink" aria-hidden />
          <span>
            <strong className="font-semibold">Tip: </strong>
            {review.tip}
          </span>
        </p>
      )}
      <p className="text-xs text-faint">
        {review.model} · {fmtShortDate(review.createdAt, user.timezone)} {fmtTime(review.createdAt, user.timezone)}
        {review.cached ? ' · cached' : ''}
      </p>
    </div>
  );
}

function AskCoach({ disabled, onError }: { disabled: boolean; onError: (e: unknown) => void }) {
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [thread, setThread] = useState<Array<{ q: string; a: string }>>([]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    try {
      const res = await api.coachAsk(question);
      setThread((t) => [...t, { q: question, a: res.answer }]);
      setQ('');
    } catch (err) {
      onError(err);
    } finally {
      setBusy(false);
      void qc.invalidateQueries({ queryKey: qk.coachStatus });
    }
  };

  return (
    <div className="mt-5 border-t border-line/60 pt-4">
      <h4 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Ask the coach</h4>
      {thread.length > 0 && (
        <ul className="mb-3 flex flex-col gap-2">
          {thread.map((t, i) => (
            <li key={i} className="flex flex-col gap-1.5">
              <p className="max-w-[85%] self-end rounded-2xl rounded-br-md bg-accent px-3 py-2 text-sm font-medium text-on-accent">{t.q}</p>
              <p className="max-w-[92%] self-start rounded-2xl rounded-bl-md bg-surface-2 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">{t.a}</p>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={submit} className="flex items-end gap-2">
        <label htmlFor="coach-q" className="sr-only">
          Question for the coach
        </label>
        <textarea
          id="coach-q"
          value={q}
          onChange={(e) => setQ(e.target.value.slice(0, 500))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={1}
          disabled={disabled}
          placeholder="e.g. My shoulder hurts on bench — what should I swap?"
          className="max-h-32 min-h-12 flex-1 resize-none rounded-2xl border border-line bg-surface-2 px-4 py-3 text-[16px] leading-snug outline-none placeholder:text-faint focus:border-accent-ink disabled:opacity-50"
        />
        <Button type="submit" variant="primary" className="size-12 shrink-0 px-0" loading={busy} disabled={disabled || !q.trim()} aria-label="Ask">
          {!busy && <Send className="size-5" aria-hidden />}
        </Button>
      </form>
      <p className="mt-1 text-right text-xs text-faint">{q.length}/500</p>
    </div>
  );
}

export function CoachCard() {
  const qc = useQueryClient();
  const online = useOnline();
  const { data: status, isPending: statusPending } = useCoachStatus();
  const { data: review, isPending: reviewPending } = useCoachReview();
  const { blocked, handle } = useCoachErrors();
  const [generating, setGenerating] = useState(false);
  const countdown = useCountdown(blocked?.kind === 'rate' ? blocked.until : null);
  const rateLimited = blocked?.kind === 'rate' && countdown > 0;
  const unavailable = blocked?.kind === 'unavailable' || status?.enabled === false;
  const outOfCalls = status?.enabled && status.remainingToday <= 0;
  const disabled = unavailable || rateLimited || !!outOfCalls || !online;

  const generate = async (force: boolean) => {
    setGenerating(true);
    try {
      const r = await api.createCoachReview(force);
      qc.setQueryData(qk.coachReview, r);
    } catch (e) {
      handle(e);
    } finally {
      setGenerating(false);
      void qc.invalidateQueries({ queryKey: qk.coachStatus });
    }
  };

  return (
    <Card className="scroll-mt-4 p-4" >
      <div id="coach" className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-info-soft text-info">
          <Bot className="size-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-lg leading-tight font-bold">AI coach</h3>
          <p className="text-sm text-muted">
            {statusPending
              ? 'Checking…'
              : unavailable
                ? 'Not configured on this server'
                : status
                  ? `${plural(status.remainingToday, 'request')} left today`
                  : 'Weekly review & Q&A'}
          </p>
        </div>
        {review && !unavailable && (
          <Button variant="ghost" size="sm" icon={<RefreshCw className="size-4" aria-hidden />} disabled={disabled || generating} onClick={() => void generate(true)} aria-label="Regenerate review">
            Redo
          </Button>
        )}
      </div>

      {rateLimited && (
        <p role="status" className="mt-3 rounded-2xl bg-warn-soft px-4 py-3 text-sm font-medium text-warn">
          The coach is catching its breath — try again in {fmtClock(countdown)}.
        </p>
      )}
      {!online && <p className="mt-3 text-sm text-muted">You’re offline. The coach needs a connection.</p>}

      <div className="mt-4">
        {generating ? (
          <div className="flex flex-col gap-2" aria-busy="true" aria-label="Generating review">
            <p className="flex items-center gap-2 text-sm text-muted">
              <Sparkles className="size-4 animate-pulse text-info" aria-hidden /> Reviewing your week…
            </p>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="mt-2 h-16 w-full" />
          </div>
        ) : review ? (
          <ReviewBody review={review} />
        ) : reviewPending ? (
          <Skeleton className="h-16 w-full" />
        ) : unavailable ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">
            AI features are switched off here (no API key). Your rule-based plan above works exactly the same — every suggestion is computed from your logs.
          </p>
        ) : (
          <div className="rounded-2xl bg-surface-2/60 p-4 text-center">
            <p className="text-sm text-muted">Get a short review of your week: wins, concerns, weight tweaks and exercise swaps you can apply in one tap.</p>
            <Button variant="primary" className="mt-3" icon={<Sparkles className="size-5" aria-hidden />} disabled={disabled} onClick={() => void generate(false)}>
              Get AI review
            </Button>
          </div>
        )}
      </div>

      {!unavailable && <AskCoach disabled={disabled} onError={handle} />}
    </Card>
  );
}
