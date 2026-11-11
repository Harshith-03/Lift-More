import { useEffect } from 'react';
import { useLocation } from 'react-router';
import { useUser } from '../../lib/queries';
import { SectionTitle } from '../../components/ui';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { SettingsSection } from './SettingsSection';
import { RoutinesSection } from './RoutinesSection';
import { DataSection } from './DataSection';
import { AccountSection, AppearanceSection } from './AccountSection';

export function ProfilePage() {
  const user = useUser();
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const t = window.setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    return () => window.clearTimeout(t);
  }, [location.hash]);

  return (
    <div>
      <header className="flex items-center gap-4 pt-6 pb-2">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-3xl bg-accent text-2xl font-extrabold text-on-accent" aria-hidden>
          {user.displayName.trim().charAt(0).toUpperCase() || '?'}
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold tracking-tight">{user.displayName}</h1>
          <p className="truncate text-sm text-muted">{user.email}</p>
        </div>
      </header>

      <SectionTitle>Training</SectionTitle>
      <ErrorBoundary compact>
        <SettingsSection />
      </ErrorBoundary>

      <div id="routines" className="scroll-mt-4">
        <SectionTitle>Routines</SectionTitle>
      </div>
      <ErrorBoundary compact>
        <RoutinesSection />
      </ErrorBoundary>

      <SectionTitle>Appearance</SectionTitle>
      <AppearanceSection />

      <SectionTitle>Your data</SectionTitle>
      <DataSection />

      <SectionTitle>Account</SectionTitle>
      <AccountSection />

      <p className="mt-8 text-center text-xs text-faint">Lift More · works offline · your data, exportable any time</p>
    </div>
  );
}
