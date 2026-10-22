import { ButtonLink } from '../components/Button';
import { EmptyState } from '../components/ui';

export function NotFound() {
  return (
    <div className="container" style={{ padding: '72px 16px' }}>
      <EmptyState
        icon="🧭"
        title="Page not found"
        text="The page you're looking for doesn't exist or has moved."
        action={
          <ButtonLink to="/" variant="primary">
            Go home
          </ButtonLink>
        }
      />
    </div>
  );
}
