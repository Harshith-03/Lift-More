import { useNavigate } from 'react-router';
import { Compass } from 'lucide-react';
import { Button, EmptyState } from '../../components/ui';

export function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg items-center justify-center px-4">
      <EmptyState
        icon={<Compass className="size-7" aria-hidden />}
        title="Nothing here"
        body="That page doesn’t exist."
        action={
          <Button variant="primary" onClick={() => navigate('/')}>
            Go home
          </Button>
        }
      />
    </div>
  );
}
