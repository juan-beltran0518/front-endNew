import { memo } from 'react';

const toneLabels = {
  info: 'Información',
  success: 'Éxito',
  warn: 'Advertencia',
  danger: 'Error',
};

const Toast = memo(function Toast({ id, title, description, tone = 'info', onDismiss }) {
  return (
    <div className={`toast toast-${tone}`} role="status" aria-label={toneLabels[tone] || 'Aviso'}>
      <div className="toast-body">
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      <button
        type="button"
        className="toast-dismiss"
        onClick={() => onDismiss?.(id)}
        aria-label="Cerrar notificación"
      >
        ×
      </button>
    </div>
  );
});

export default Toast;
