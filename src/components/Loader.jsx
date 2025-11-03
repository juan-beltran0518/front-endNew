import { memo } from 'react';

const Loader = memo(function Loader({ label = 'Cargando' }) {
  return (
    <div className="loader" role="status" aria-live="polite">
      <span className="loader-indicator" aria-hidden="true" />
      <span className="loader-label">{label}</span>
    </div>
  );
});

export default Loader;
