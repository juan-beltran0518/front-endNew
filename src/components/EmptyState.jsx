import { memo } from 'react';

const EmptyState = memo(function EmptyState({ title, description, action }) {
  return (
    <section className="empty-state" aria-live="polite">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action ? <div className="empty-action">{action}</div> : null}
    </section>
  );
});

export default EmptyState;
