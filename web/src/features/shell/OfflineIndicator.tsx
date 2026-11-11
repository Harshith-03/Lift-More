import { WifiOff } from 'lucide-react';
import clsx from 'clsx';
import { useOnline } from '../../lib/hooks';

/** Slim status pill shown while offline (data comes from the local cache). */
export function OfflineIndicator({ className }: { className?: string }) {
  const online = useOnline();
  if (online) return null;
  return (
    <div
      role="status"
      className={clsx(
        'sticky top-0 z-30 flex justify-center bg-bg/80 px-4 pt-[calc(env(safe-area-inset-top)+0.25rem)] pb-1 backdrop-blur',
        className,
      )}
    >
      <span className="inline-flex items-center gap-2 rounded-full bg-warn-soft px-3 py-1 text-xs font-semibold text-warn">
        <WifiOff className="size-3.5" aria-hidden />
        Offline — showing saved data, workouts sync later
      </span>
    </div>
  );
}
