import { useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { Check, ChevronLeft } from 'lucide-react';
import type { Experience, Goal, RoutineTemplate, Unit, User } from '../../../../shared/types';
import { TEMPLATES } from '../../../../shared/engine';
import { api, errorMessage } from '../../lib/api';
import { qk } from '../../lib/queryClient';
import { Badge, Button, IconButton, Stepper } from '../../components/ui';
import { useToast } from '../../components/feedback';

const KG_PER_LB = 0.45359237;

function OptionCard({
  selected,
  onClick,
  title,
  body,
  aside,
}: {
  selected: boolean;
  onClick: () => void;
  title: ReactNode;
  body?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={clsx(
        'flex w-full items-center gap-4 rounded-3xl border-2 p-4 text-left transition-colors',
        selected ? 'border-accent-ink bg-accent-soft' : 'border-line bg-surface active:bg-surface-2',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="text-base font-bold">{title}</div>
        {body && <div className="mt-0.5 text-sm text-muted">{body}</div>}
      </div>
      {aside}
      <span
        aria-hidden
        className={clsx(
          'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
          selected ? 'border-accent bg-accent text-on-accent' : 'border-line',
        )}
      >
        {selected && <Check className="size-4" strokeWidth={3} />}
      </span>
    </button>
  );
}

function scoreTemplate(t: RoutineTemplate, goal: Goal, exp: Experience, days: number): number {
  let s = 0;
  if (t.daysPerWeek === days) s += 3;
  else if (Math.abs(t.daysPerWeek - days) === 1) s += 1;
  if (t.level === exp) s += 2;
  if (t.goal === goal) s += 2;
  return s;
}

export function Onboarding({ user }: { user: User }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [unit, setUnit] = useState<Unit>(user.unit);
  const [goal, setGoal] = useState<Goal>(user.goal);
  const [experience, setExperience] = useState<Experience>(user.experience);
  const [days, setDays] = useState(user.daysPerWeek || 3);
  // undefined = not chosen yet → the recommended template is preselected
  const [picked, setTemplateId] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const templates = useMemo(
    () => [...TEMPLATES].sort((a, b) => scoreTemplate(b, goal, experience, days) - scoreTemplate(a, goal, experience, days)),
    [goal, experience, days],
  );
  const best = templates[0] ? scoreTemplate(templates[0], goal, experience, days) : -1;
  const templateId = picked === undefined ? (best > 0 ? templates[0]!.id : null) : picked;

  const finish = async () => {
    setBusy(true);
    try {
      if (templateId) await api.routinesFromTemplate(templateId, true);
      let tz = user.timezone;
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
      } catch {
        /* keep */
      }
      const updated = await api.patchMe({
        unit,
        goal,
        experience,
        daysPerWeek: days,
        timezone: tz,
        // 45 lb bar for imperial users, 20 kg otherwise
        barWeightKg: unit === 'lb' ? Math.round(45 * KG_PER_LB * 100) / 100 : 20,
        onboarded: true,
      });
      qc.setQueryData(qk.me, updated);
      void qc.invalidateQueries({ queryKey: qk.routines });
      void qc.invalidateQueries({ queryKey: qk.plan });
    } catch (e) {
      toast.error(errorMessage(e, 'Could not save your setup'));
    } finally {
      setBusy(false);
    }
  };

  const steps: Array<{ title: string; subtitle: string; body: ReactNode }> = [
    {
      title: 'How do you weigh plates?',
      subtitle: 'You can change this any time in your profile.',
      body: (
        <div role="radiogroup" aria-label="Unit" className="grid grid-cols-2 gap-3">
          {(['kg', 'lb'] as const).map((u) => (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={unit === u}
              onClick={() => setUnit(u)}
              className={clsx(
                'flex aspect-square flex-col items-center justify-center rounded-3xl border-2 transition-colors',
                unit === u ? 'border-accent-ink bg-accent-soft' : 'border-line bg-surface',
              )}
            >
              <span className="text-5xl font-extrabold tracking-tight">{u}</span>
              <span className="mt-2 text-sm text-muted">{u === 'kg' ? 'Kilograms' : 'Pounds'}</span>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: 'What’s your main goal?',
      subtitle: 'This sets your rep ranges and weekly volume targets.',
      body: (
        <div role="radiogroup" aria-label="Goal" className="flex flex-col gap-3">
          <OptionCard selected={goal === 'strength'} onClick={() => setGoal('strength')} title="Get stronger" body="Heavier weights, lower reps, longer rests." />
          <OptionCard selected={goal === 'hypertrophy'} onClick={() => setGoal('hypertrophy')} title="Build muscle" body="Moderate reps, more weekly sets per muscle." />
          <OptionCard selected={goal === 'general'} onClick={() => setGoal('general')} title="General fitness" body="Balanced training that fits a busy week." />
        </div>
      ),
    },
    {
      title: 'Your training',
      subtitle: 'Beginners progress faster — we’ll push you accordingly.',
      body: (
        <div className="flex flex-col gap-6">
          <div role="radiogroup" aria-label="Experience" className="flex flex-col gap-3">
            <OptionCard selected={experience === 'beginner'} onClick={() => setExperience('beginner')} title="Beginner" body="Less than a year of consistent lifting." />
            <OptionCard selected={experience === 'intermediate'} onClick={() => setExperience('intermediate')} title="Intermediate" body="1–3 years, comfortable with the main lifts." />
            <OptionCard selected={experience === 'advanced'} onClick={() => setExperience('advanced')} title="Advanced" body="3+ years, progress comes slowly." />
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-muted">Days per week</p>
            <Stepper label="days per week" value={days} min={1} max={7} onChange={setDays} format={(v) => `${v} day${v === 1 ? '' : 's'}`} />
          </div>
        </div>
      ),
    },
    {
      title: 'Pick a starting program',
      subtitle: 'Routines are fully editable later. Suggestions update every week.',
      body: (
        <div role="radiogroup" aria-label="Program" className="flex flex-col gap-3">
          {templates.map((t) => (
            <OptionCard
              key={t.id}
              selected={templateId === t.id}
              onClick={() => setTemplateId(t.id)}
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {t.name}
                  {scoreTemplate(t, goal, experience, days) === best && best > 0 && <Badge tone="accent">Recommended</Badge>}
                </span>
              }
              body={
                <>
                  <span className="block">{t.description}</span>
                  <span className="mt-1 block text-xs text-faint">
                    {t.daysPerWeek} days/week · {t.routines.map((r) => r.name).join(' · ')}
                  </span>
                </>
              }
            />
          ))}
          <OptionCard
            selected={templateId === null}
            onClick={() => setTemplateId(null)}
            title="Start blank"
            body="Build your own routines, or just log empty workouts."
          />
        </div>
      ),
    },
  ];

  const current = steps[step]!;
  const last = step === steps.length - 1;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pt-safe">
      <div className="flex h-14 items-center gap-2">
        {step > 0 ? (
          <IconButton label="Back" onClick={() => setStep((s) => s - 1)}>
            <ChevronLeft className="size-6" aria-hidden />
          </IconButton>
        ) : (
          <span className="size-11" />
        )}
        <div className="flex flex-1 gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`} role="progressbar" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={step + 1}>
          {steps.map((_, i) => (
            <span key={i} className={clsx('h-1.5 flex-1 rounded-full transition-colors', i <= step ? 'bg-accent' : 'bg-surface-3')} />
          ))}
        </div>
        <span className="size-11" />
      </div>

      <div className="flex-1 pb-6 pt-4">
        <p className="text-sm font-semibold text-accent-ink">Welcome, {user.displayName.split(' ')[0]}</p>
        <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight">{current.title}</h1>
        <p className="mt-2 text-muted">{current.subtitle}</p>
        <div className="mt-6">{current.body}</div>
      </div>

      <div className="sticky bottom-0 -mx-5 border-t border-line bg-bg/95 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur">
        <Button
          variant="primary"
          size="lg"
          block
          loading={busy}
          onClick={() => (last ? void finish() : setStep((s) => s + 1))}
        >
          {last ? (templateId ? 'Create my routines' : 'Start training') : 'Continue'}
        </Button>
      </div>
    </div>
  );
}
