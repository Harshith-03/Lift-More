import { Component, type ErrorInfo, type ReactNode } from 'react';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router';
import { TriangleAlert } from 'lucide-react';
import { Button } from './ui';

function friendly(error: unknown): { title: string; detail: string } {
  const msg = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/engine: not implemented/i.test(msg))
    return {
      title: 'This part of Lift More is still warming up',
      detail: 'The progression engine isn’t available in this build yet. Everything else keeps working.',
    };
  if (/Loading chunk|dynamically imported module|Failed to fetch dynamically/i.test(msg))
    return { title: 'A new version is available', detail: 'Reload the app to get the latest update.' };
  return { title: 'Something went wrong', detail: msg || 'An unexpected error occurred.' };
}

export function ErrorPanel({ error, onRetry, compact }: { error: unknown; onRetry?: () => void; compact?: boolean }) {
  const { title, detail } = friendly(error);
  return (
    <div role="alert" className={compact ? 'rounded-2xl border border-line bg-surface p-4' : 'flex flex-col items-center px-6 py-16 text-center'}>
      <div className={compact ? 'flex items-start gap-3' : 'flex flex-col items-center'}>
        <div className={compact ? 'mt-0.5 text-warn' : 'mb-4 flex size-14 items-center justify-center rounded-2xl bg-warn-soft text-warn'}>
          <TriangleAlert className={compact ? 'size-5' : 'size-7'} aria-hidden />
        </div>
        <div>
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm text-muted">{detail}</p>
        </div>
      </div>
      {onRetry && (
        <Button variant="secondary" size="sm" className={compact ? 'mt-3' : 'mt-5'} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Section-level boundary so one broken widget doesn't take down the screen. */
export class ErrorBoundary extends Component<{ children: ReactNode; fallback?: (error: unknown, reset: () => void) => ReactNode; compact?: boolean }, { error: unknown }> {
  override state = { error: null as unknown };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ui]', error, info.componentStack);
  }

  reset = () => this.setState({ error: null });

  override render() {
    if (this.state.error) {
      return this.props.fallback ? this.props.fallback(this.state.error, this.reset) : <ErrorPanel error={this.state.error} onRetry={this.reset} compact={this.props.compact} />;
    }
    return this.props.children;
  }
}

/** react-router errorElement. */
export function RouteError() {
  const error = useRouteError();
  const navigate = useNavigate();
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-safe">
        <ErrorPanel error={new Error('That page doesn’t exist.')} />
        <div className="flex justify-center">
          <Button variant="primary" onClick={() => navigate('/')}>Go home</Button>
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-lg px-4 pt-safe">
      <ErrorPanel error={error} />
      <div className="flex justify-center gap-3">
        <Button variant="secondary" onClick={() => window.location.reload()}>Reload</Button>
        <Button variant="primary" onClick={() => navigate('/')}>Go home</Button>
      </div>
    </div>
  );
}
