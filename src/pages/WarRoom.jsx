import { useEffect, useMemo, useState } from 'react';
import { useAppActions, useAppState } from '../app/state.js';
import { getRouteHash, navigate } from '../app/router.js';
import Loader from '../components/Loader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';

const formatTimestamp = (value) => {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const POLL_INTERVAL = Number(import.meta?.env?.VITE_WARROOM_POLL_INTERVAL || 10000);

function WarRoom({ params }) {
  const warRoomId = params.id;
  const { warRooms, loading } = useAppState();
  const {
    openWarRoom,
    loadWarRoomMessages,
    sendWarRoomMessage,
    updateIncidentStatus,
    updateWarRoomChecklist,
  } = useAppActions();

  const warRoom = warRooms[warRoomId];
  const [message, setMessage] = useState('');
  const [confirmContain, setConfirmContain] = useState(false);
  const [localChecklist, setLocalChecklist] = useState(warRoom?.checklist || []);

  const incidentId = useMemo(() => {
    if (warRoom?.incidentId) return warRoom.incidentId;
    if (warRoomId?.startsWith('WR-')) return warRoomId.substring(3);
    return warRoomId;
  }, [warRoom, warRoomId]);

  useEffect(() => {
    if (!warRoom && incidentId) {
      openWarRoom(incidentId);
    }
  }, [warRoom, incidentId, openWarRoom]);

  useEffect(() => {
    if (!warRoomId) return;
    loadWarRoomMessages(warRoomId);
    const interval = window.setInterval(() => loadWarRoomMessages(warRoomId), POLL_INTERVAL);
    return () => window.clearInterval(interval);
  }, [warRoomId, loadWarRoomMessages]);

  useEffect(() => {
    if (warRoom?.checklist) {
      setLocalChecklist(warRoom.checklist);
    }
  }, [warRoom]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!message.trim()) return;
    await sendWarRoomMessage(warRoomId, message.trim());
    setMessage('');
  };

  const handleChecklistToggle = (itemId) => {
    setLocalChecklist((current) => {
      const updated = current.map((item) =>
        item.id === itemId ? { ...item, done: !item.done } : item,
      );
      updateWarRoomChecklist(warRoomId, updated);
      return updated;
    });
  };

  const handleMarkContained = async () => {
    if (!incidentId) return;
    await updateIncidentStatus(incidentId, 'mark_contained');
    setConfirmContain(false);
    navigate(getRouteHash('incident', { id: incidentId }));
  };

  if (loading.warRoom && !warRoom) {
    return (
      <div className="page">
        <Loader label="Cargando mesa de trabajo" />
      </div>
    );
  }

  if (!warRoom) {
    return (
      <div className="page">
        <EmptyState
          title="Mesa de trabajo no encontrada"
          description="Verifica que el incidente tenga una mesa asignada."
          action={
            <button type="button" className="btn primary" onClick={() => navigate(getRouteHash('dashboard'))}>
              Volver al dashboard
            </button>
          }
        />
      </div>
    );
  }

  const messages = warRoom.messages || [];

  return (
    <div className="page war-room-page">
      <header className="page-header">
        <div>
          <h2>{warRoom.id}</h2>
          <p>Incidente {incidentId}</p>
        </div>
        <div className="actions-row">
          <button
            type="button"
            className="btn subtle"
            onClick={() => navigate(getRouteHash('incident', { id: incidentId }))}
          >
            Volver al detalle
          </button>
          <button type="button" className="btn success" onClick={() => setConfirmContain(true)}>
            Marcar como contenido
          </button>
        </div>
      </header>

      <div className="war-room-layout">
        <section className="panel chat-panel" aria-labelledby="chat-heading">
          <header>
            <h3 id="chat-heading">Chat con IA de respuesta</h3>
            <span>Actualiza cada 10 segundos</span>
          </header>
          <div className="chat-messages" aria-live="polite">
            {messages.map((item) => (
              <article key={item.id} className={`chat-message chat-${item.role}`}>
                <header>
                  <span>{item.role === 'assistant' ? 'Asistente' : 'Analista'}</span>
                  <time dateTime={item.createdAt}>{formatTimestamp(item.createdAt)}</time>
                </header>
                <p>{item.content}</p>
              </article>
            ))}
          </div>
          <form className="chat-form" onSubmit={handleSubmit}>
            <label htmlFor="chat-input" className="sr-only">
              Escribe un mensaje
            </label>
            <textarea
              id="chat-input"
              rows={3}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="Describe el siguiente paso o pregunta a la IA."
              required
            />
            <div className="chat-actions">
              <button type="submit" className="btn primary">
                Enviar
              </button>
            </div>
          </form>
        </section>

        <aside className="panel checklist-panel" aria-labelledby="checklist-heading">
          <header>
            <h3 id="checklist-heading">Checklist sugerida</h3>
          </header>
          <ul className="checklist">
            {localChecklist.map((item) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={item.done}
                    onChange={() => handleChecklistToggle(item.id)}
                  />
                  <span>{item.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <ConfirmDialog
        open={confirmContain}
        title="Marcar incidente como contenido"
        description="Se actualizará el estado del incidente asociado."
        tone="success"
        confirmLabel="Marcar contenido"
        cancelLabel="Cancelar"
        onCancel={() => setConfirmContain(false)}
        onConfirm={handleMarkContained}
      />
    </div>
  );
}

export default WarRoom;
