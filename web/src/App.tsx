import { lazy, Suspense, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { persistOptions, qk, queryClient } from './lib/queryClient';
import { setUnauthorizedHandler } from './lib/api';
import { FeedbackProvider } from './components/feedback';
import { RouteError } from './components/ErrorBoundary';
import { Skeleton } from './components/ui';
import { AuthGate } from './features/auth/AuthGate';
import { TabLayout } from './features/shell/TabLayout';
import { NotFound } from './features/shell/NotFound';
import { HomePage } from './features/home/HomePage';
import { HistoryPage } from './features/history/HistoryPage';
import { WorkoutDetailPage } from './features/history/WorkoutDetailPage';
import { EditWorkoutPage } from './features/history/EditWorkoutPage';
import { ActiveWorkoutPage } from './features/workout/ActiveWorkoutPage';
import { WorkoutSummaryPage } from './features/workout/WorkoutSummaryPage';
import { ProfilePage } from './features/profile/ProfilePage';
import { RoutineEditorPage } from './features/profile/RoutineEditorPage';

// Chart-heavy screens load on demand (still precached by the service worker for offline use).
const PlanPage = lazy(() => import('./features/plan/PlanPage'));
const ProgressPage = lazy(() => import('./features/progress/ProgressPage'));

// Any 401 (expired session) drops back to the login screen.
setUnauthorizedHandler(() => queryClient.setQueryData(qk.me, null));

function PageFallback() {
  return (
    <div className="space-y-4 pt-6" aria-busy="true" aria-label="Loading">
      <Skeleton className="h-9 w-40" />
      <Skeleton className="h-40" />
      <Skeleton className="h-28" />
    </div>
  );
}

const lazyPage = (node: ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>;

const router = createBrowserRouter([
  {
    element: <AuthGate />,
    errorElement: <RouteError />,
    children: [
      {
        element: <TabLayout />,
        errorElement: <RouteError />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'history', element: <HistoryPage /> },
          { path: 'plan', element: lazyPage(<PlanPage />) },
          { path: 'progress', element: lazyPage(<ProgressPage />) },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
      { path: 'workout', element: <ActiveWorkoutPage />, errorElement: <RouteError /> },
      { path: 'workout/summary', element: <WorkoutSummaryPage />, errorElement: <RouteError /> },
      { path: 'history/:id', element: <WorkoutDetailPage />, errorElement: <RouteError /> },
      { path: 'history/:id/edit', element: <EditWorkoutPage />, errorElement: <RouteError /> },
      { path: 'routines/new', element: <RoutineEditorPage />, errorElement: <RouteError /> },
      { path: 'routines/:id', element: <RoutineEditorPage />, errorElement: <RouteError /> },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export function App() {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      onSuccess={() => {
        // The restored `me` may predate the last write (the persister is throttled), so re-check it once
        // in the background; the restored copy still renders instantly and keeps working offline.
        void queryClient.invalidateQueries({ queryKey: qk.me });
        void queryClient.resumePausedMutations();
      }}
    >
      <FeedbackProvider>
        <RouterProvider router={router} />
      </FeedbackProvider>
    </PersistQueryClientProvider>
  );
}
