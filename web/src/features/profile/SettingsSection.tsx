import { useEffect, useState } from 'react';
import type { Experience, Goal, Unit, UserSettingsPatch } from '../../../../shared/types';
import { kgToUnit } from '../../../../shared/engine';
import { errorMessage } from '../../lib/api';
import { useUpdateMe, useUser } from '../../lib/queries';
import { fmtRest, inputToKg, roundTo } from '../../lib/format';
import { Card, Segmented, SelectField, Stepper, TextField } from '../../components/ui';
import { NumericInput } from '../../components/NumericInput';
import { useToast } from '../../components/feedback';

const REST_CHOICES = [45, 60, 90, 120, 150, 180, 240, 300];
const BAR_KG = 20;
const BAR_LB_IN_KG = 20.41; // 45 lb

function Row({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-sm font-medium text-muted">{label}</p>
      {children}
      {hint && <p className="text-xs text-faint">{hint}</p>}
    </div>
  );
}

export function SettingsSection() {
  const user = useUser();
  const update = useUpdateMe();
  const toast = useToast();
  const [name, setName] = useState(user.displayName);
  const [bar, setBar] = useState<number | null>(roundTo(kgToUnit(user.barWeightKg, user.unit), 2));

  useEffect(() => setName(user.displayName), [user.displayName]);
  useEffect(() => setBar(roundTo(kgToUnit(user.barWeightKg, user.unit), 2)), [user.barWeightKg, user.unit]);

  const patch = (p: UserSettingsPatch) =>
    update.mutate(p, { onError: (e) => toast.error(errorMessage(e, 'Could not save settings')) });

  const setUnit = (unit: Unit) => {
    if (unit === user.unit) return;
    const p: UserSettingsPatch = { unit };
    // keep the standard bar for the new unit if the user never customised it
    if (unit === 'lb' && Math.abs(user.barWeightKg - BAR_KG) < 0.01) p.barWeightKg = BAR_LB_IN_KG;
    if (unit === 'kg' && Math.abs(user.barWeightKg - BAR_LB_IN_KG) < 0.01) p.barWeightKg = BAR_KG;
    patch(p);
  };

  return (
    <Card className="flex flex-col gap-5 p-4">
      <TextField
        label="Display name"
        value={name}
        maxLength={60}
        autoComplete="nickname"
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const v = name.trim();
          if (v && v !== user.displayName) patch({ displayName: v });
          else setName(user.displayName);
        }}
      />
      <Row label="Units">
        <Segmented<Unit>
          label="Units"
          value={user.unit}
          onChange={setUnit}
          options={[
            { value: 'kg', label: 'Kilograms' },
            { value: 'lb', label: 'Pounds' },
          ]}
        />
      </Row>
      <Row label="Goal">
        <Segmented<Goal>
          label="Goal"
          value={user.goal}
          onChange={(goal) => patch({ goal })}
          options={[
            { value: 'strength', label: 'Strength' },
            { value: 'hypertrophy', label: 'Muscle' },
            { value: 'general', label: 'General' },
          ]}
        />
      </Row>
      <Row label="Experience">
        <Segmented<Experience>
          label="Experience"
          value={user.experience}
          onChange={(experience) => patch({ experience })}
          options={[
            { value: 'beginner', label: 'Beginner' },
            { value: 'intermediate', label: 'Interm.' },
            { value: 'advanced', label: 'Advanced' },
          ]}
        />
      </Row>
      <Row label="Training days per week">
        <Stepper label="days per week" value={user.daysPerWeek} min={1} max={7} onChange={(daysPerWeek) => patch({ daysPerWeek })} format={(v) => `${v} day${v === 1 ? '' : 's'}`} />
      </Row>
      <div className="grid grid-cols-2 gap-3">
        <SelectField label="Default rest" value={user.defaultRestSec} onChange={(e) => patch({ defaultRestSec: Number(e.target.value) })}>
          {[...new Set([...REST_CHOICES, user.defaultRestSec])]
            .sort((a, b) => a - b)
            .map((s) => (
              <option key={s} value={s}>
                {fmtRest(s)}
              </option>
            ))}
        </SelectField>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="bar-weight" className="text-sm font-medium text-muted">
            Bar weight ({user.unit})
          </label>
          <NumericInput
            id="bar-weight"
            decimal
            value={bar}
            onValueChange={setBar}
            onBlur={() => {
              const kg = inputToKg(bar, user.unit);
              if (kg != null && kg > 0 && Math.abs(kg - user.barWeightKg) > 0.001) patch({ barWeightKg: roundTo(kg, 2) });
              else setBar(roundTo(kgToUnit(user.barWeightKg, user.unit), 2));
            }}
            className="min-h-12 w-full rounded-2xl border border-line bg-surface-2 px-4 text-[16px] font-semibold outline-none focus:border-accent-ink"
          />
        </div>
      </div>
    </Card>
  );
}
