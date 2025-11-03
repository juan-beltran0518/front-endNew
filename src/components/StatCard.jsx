import { memo } from 'react';

const StatCard = memo(function StatCard({ label, value, helper, tone = 'default' }) {
  return (
    <article className={`stat-card stat-card-${tone}`} aria-live="polite">
      <span className="stat-label">{label}</span>
      <strong className="stat-value">{value}</strong>
      {helper ? <span className="stat-helper">{helper}</span> : null}
    </article>
  );
});

export default StatCard;
