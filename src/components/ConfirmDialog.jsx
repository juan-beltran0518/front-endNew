import { useMemo } from 'react';
import Modal from './Modal.jsx';

function ConfirmDialog({ open, title, description, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', tone = 'warn', onConfirm, onCancel, children }) {
  const memoActions = useMemo(
    () => (
      <>
        <button type="button" className="btn subtle" onClick={onCancel}>
          {cancelLabel}
        </button>
        <button type="button" className={`btn ${tone}`} onClick={onConfirm}>
          {confirmLabel}
        </button>
      </>
    ),
    [cancelLabel, confirmLabel, onCancel, onConfirm, tone],
  );

  return (
    <Modal open={open} title={title} description={description} onClose={onCancel} actions={memoActions}>
      {children}
    </Modal>
  );
}

export default ConfirmDialog;
