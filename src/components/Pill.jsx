import { memo } from 'react';

const Pill = memo(function Pill({ tone = 'neutral', children }) {
  return (
    <span className={`pill pill-${tone}`} role="status">
      {children}
    </span>
  );
});

export default Pill;
