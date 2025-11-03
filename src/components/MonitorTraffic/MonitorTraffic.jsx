import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppActions, useAppState } from '../../app/state.js';
import { connectTrafficStream } from '../../app/api.js';
import { getRouteHash, navigate } from '../../app/router.js';
import Modal from '../Modal.jsx';
import Loader from '../Loader.jsx';
import PacketRow from './PacketRow.jsx';
import TrafficCanvas from './TrafficCanvas.jsx';
import './MonitorTraffic.css';

const ROW_HEIGHT = 46;
const VISIBLE_ROWS = 14;
const PROTOCOLS = ['ALL', 'TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS', 'DNS', 'SSL'];
const SEVERITIES = ['ALL', 'critical', 'high', 'medium', 'low'];

function MonitorTraffic() {
  // Debug: Forzar monitor habilitado para pruebas
  const monitorEnabled = import.meta?.env?.VITE_MONITOR_ENABLED === 'true' || true;
  console.log('[MonitorTraffic] VITE_MONITOR_ENABLED:', import.meta?.env?.VITE_MONITOR_ENABLED, 'monitorEnabled:', monitorEnabled);

  if (!monitorEnabled) {
    return (
      <section className="monitor-traffic placeholder" aria-label="Wireframe monitor de tráfico">
        <header className="monitor-toolbar">
          <div>
            <h3>Monitor de tráfico (wireframe)</h3>
            <p>Activa `VITE_MONITOR_ENABLED=true` y configura el backend para ver los paquetes en tiempo real.</p>
          </div>
        </header>
        <div className="monitor-mock">
          <div className="mock-list">
            <div className="mock-row header">
              <span>#</span>
              <span>Hora</span>
              <span>Origen</span>
              <span>Destino</span>
              <span>Proto</span>
              <span>Len</span>
              <span>Detección</span>
              <span>Info</span>
            </div>
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="mock-row">
                <span>{index + 1}</span>
                <span>00:00:00.000</span>
                <span>0.0.0.0:0000</span>
                <span>0.0.0.0:0000</span>
                <span>TCP</span>
                <span>000</span>
                <span>—</span>
                <span>Descripción del paquete</span>
              </div>
            ))}
          </div>
          <aside className="mock-detail">
            <h4>Detalle del paquete</h4>
            <p>Una vez integrado el backend podrás ver el detalle, payload y acciones sobre el paquete seleccionado.</p>
          </aside>
        </div>
      </section>
    );
  }

  return <MonitorTrafficLive />;
}

function MonitorTrafficLive() {
  const { traffic, incidents, settings } = useAppState();
  const {
    appendTrafficBatch,
    selectTrafficPacket,
    setTrafficFilters,
    setTrafficMode,
    setTrafficPollingInterval,
    setTrafficPaused,
    setTrafficIpFilter,
    linkPacketToIncident,
    loadPacketDetail,
    requestRecentTraffic,
    createIncidentFromPacketAction,
    addToast,
  } = useAppActions();

  const [connectionStatus, setConnectionStatus] = useState('desconectado');
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createReason, setCreateReason] = useState('');
  const [createSeverity, setCreateSeverity] = useState('medium');
  const [selectedIncidentId, setSelectedIncidentId] = useState('');
  const maxPacketsReached = useRef(false);
  const packetCountRef = useRef(0);

  const listRef = useRef(null);
  const scrollTopRef = useRef(0);
  const rafRef = useRef();
  const socketRef = useRef(null);
  const pollTimerRef = useRef(null);
  const lastTimestampRef = useRef(traffic.lastTimestamp);
  const detailCacheRef = useRef(new Map());

  // IMPORTANTE: Mover selectedPacket ANTES de usarlo en las líneas siguientes
  const selectedPacket = useMemo(() => {
    const list = traffic.packets;
    return list.find((packet) => packet.id === traffic.selectedPacketId) || null;
  }, [traffic.packets, traffic.selectedPacketId]);

  const detectionModelLabel = detail?.model_label ?? detail?.detection?.model_label ?? selectedPacket?.model_label;
  const detectionModelScore = detail?.model_score ?? detail?.detection?.model_score ?? selectedPacket?.model_score;
  const detectionModelVersion = detail?.model_version ?? detail?.detection?.model_version ?? selectedPacket?.model_version;

  const initialFetchRef = useRef(false);
  const [isStreaming, setIsStreaming] = useState(false);

  useEffect(() => {
    if (initialFetchRef.current) return;
    initialFetchRef.current = true;
    requestRecentTraffic({ since: null, limit: 120 })
      .then((packets) => {
        if (packets?.length) {
          appendTrafficBatch(packets);
        }
      })
      .catch(() => {
        /* handled via toast en requestRecentTraffic */
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    lastTimestampRef.current = traffic.lastTimestamp;
  }, [traffic.lastTimestamp]);

  useEffect(() => {
    if (!selectedPacket) {
      setTrafficIpFilter(null);
      setDetail(null);
      setSelectedIncidentId('');
      return;
    }
    setTrafficIpFilter(selectedPacket.src || selectedPacket.dst);
    
    // Solo usar datos del paquete, sin cargar desde servidor
    setDetail(selectedPacket);
    setDetailLoading(false);
    
  }, [selectedPacket, setTrafficIpFilter]);

  const handleStreamEvent = useCallback(
    (type, payload) => {
      if (!type) return;
      
      switch (type) {
        case 'packet_batch':
          const packets = payload?.packets || [];
          if (packets.length > 0) {
            appendTrafficBatch(packets);
          }
          break;
        case 'batch':
          if (Array.isArray(payload?.packets)) {
            appendTrafficBatch(payload.packets);
          }
          break;
        case 'packet':
          if (payload?.packet) {
            appendTrafficBatch([payload.packet]);
          }
          break;
        case 'alert':
          if (payload?.alert) {
            const { packetId, incidentId, severity, score, model_version: modelVersion } = payload.alert;
            linkPacketToIncident(packetId, incidentId, severity);
            addToast({
              title: `Alerta ${severity || 'alta'}`,
              description: incidentId
                ? `Paquete vinculado a ${incidentId}. Score ${score ?? '—'}`
                : `Score ${score ?? '—'}${modelVersion ? ` · Modelo ${modelVersion}` : ''}`,
              tone: severity === 'critical' ? 'danger' : 'warn',
            });
          }
          break;
        case 'ml_status':
          if (payload) {
            const { status, streak, since } = payload;
            addToast({
              title: status === 'degraded' ? 'ML degradado' : 'ML recuperado',
              description:
                status === 'degraded'
                  ? `ML degradado (streak=${streak || 0}). Operando en fallback.`
                  : 'ML recuperado. Volvemos a inferencias en vivo.',
              tone: status === 'degraded' ? 'warn' : 'success',
            });
          }
          break;
        default:
          break;
      }
    },
    [appendTrafficBatch, linkPacketToIncident, addToast],
  );

  const destroyConnections = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close?.();
      socketRef.current = null;
    }
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    console.log('[MonitorTraffic] Conectando en modo:', traffic.mode);
    setConnectionStatus('conectando');
    destroyConnections();

    const tick = async () => {
      try {
        const since = lastTimestampRef.current;
        const packets = await requestRecentTraffic({ since, limit: 100 });
        if (packets?.length) {
          appendTrafficBatch(packets);
          const latest = packets[packets.length - 1];
          lastTimestampRef.current = new Date(latest.timestamp).getTime();
        }
      } catch (error) {
        setConnectionStatus('error');
      }
    };

    if (traffic.mode === 'ws') {
      console.log('[MonitorTraffic] Iniciando WebSocket a:', settings.apiBaseUrl);
      setIsStreaming(true);
      socketRef.current = connectTrafficStream(settings.apiBaseUrl, handleStreamEvent, {
        onOpen: () => {
          console.log('[MonitorTraffic] WebSocket CONECTADO');
          setConnectionStatus('en tiempo real');
        },
        onClose: () => {
          console.log('[MonitorTraffic] WebSocket CERRADO');
          setConnectionStatus('desconectado');
          setIsStreaming(false);
        },
        onError: () => {
          console.log('[MonitorTraffic] WebSocket ERROR');
          setConnectionStatus('error');
          setIsStreaming(false);
        },
      });
      // No hacer polling en modo WebSocket - los datos llegan por el stream
    } else {
      setConnectionStatus('polling');
      tick();
      pollTimerRef.current = setInterval(tick, traffic.pollingInterval);
    }

    return destroyConnections;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traffic.mode, settings.apiBaseUrl, traffic.pollingInterval]);

  useEffect(() => () => destroyConnections(), [destroyConnections]);

  const handleScroll = useCallback(() => {
    if (!listRef.current) return;
    scrollTopRef.current = listRef.current.scrollTop;
    if (rafRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => {
      const start = Math.floor(scrollTopRef.current / ROW_HEIGHT);
      const end = start + VISIBLE_ROWS + 4;
      setVisibleWindow({ start, end });
      rafRef.current = null;
    });
  }, []);

  const [visibleWindow, setVisibleWindow] = useState({ start: 0, end: VISIBLE_ROWS });

  useEffect(() => {
    const node = listRef.current;
    if (!node) return;
    node.addEventListener('scroll', handleScroll);
    return () => node.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
      setVisibleWindow({ start: 0, end: VISIBLE_ROWS });
    }
  }, [traffic.filters.protocol, traffic.filters.severity, traffic.filters.search]);

  const filteredPackets = useMemo(() => {
    const { protocol, severity, search } = traffic.filters;
    const normalized = (search || '').trim().toLowerCase();
    return traffic.packets.filter((packet) => {
      const protocolMatch = protocol === 'ALL' || packet.proto === protocol;
      const severityMatch = severity === 'ALL' || packet.severity === severity;
      const searchMatch = !normalized
        || `${packet.src}:${packet.srcPort}`.toLowerCase().includes(normalized)
        || `${packet.dst}:${packet.dstPort}`.toLowerCase().includes(normalized)
        || (packet.info || '').toLowerCase().includes(normalized)
        || (packet.incidentId || '').toLowerCase().includes(normalized);
      return protocolMatch && severityMatch && searchMatch;
    });
  }, [traffic.packets, traffic.filters]);

  const { start, end } = visibleWindow;
  const visiblePackets = filteredPackets.slice(start, end);
  const paddingTop = start * ROW_HEIGHT;
  const paddingBottom = Math.max(filteredPackets.length - end, 0) * ROW_HEIGHT;

  const handleSelectPacket = (packet) => {
    selectTrafficPacket(packet.id, packet.src || packet.dst);
  };

  const handleModeToggle = () => {
    setConnectionStatus('conectando');
    setTrafficMode(traffic.mode === 'ws' ? 'poll' : 'ws');
  };

  const handlePauseToggle = () => {
    setTrafficPaused(!traffic.paused);
  };

  const handleStopStream = () => {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
      setIsStreaming(false);
      setConnectionStatus('desconectado');
    }
  };

  const handleProtocolChange = (event) => {
    setTrafficFilters({ protocol: event.target.value });
  };

  const handleSeverityChange = (event) => {
    setTrafficFilters({ severity: event.target.value });
  };

  const handleSearchChange = (event) => {
    setTrafficFilters({ search: event.target.value });
  };

  const handleCreateIncident = async (event) => {
    event.preventDefault();
    if (!selectedPacket) return;
    try {
      const result = await createIncidentFromPacketAction({
        packetId: selectedPacket.id,
        reason: createReason,
        severity: createSeverity,
      });
      setCreateModalOpen(false);
      setCreateReason('');
      setSelectedIncidentId(result.incidentId);
    } catch (error) {
      // handled by action
    }
  };

  const handleLinkToIncident = () => {
    if (!selectedPacket || !selectedIncidentId) return;
    linkPacketToIncident(selectedPacket.id, selectedIncidentId, selectedPacket.severity);
    addToast({
      title: 'Paquete vinculado',
      description: `Se marcó relación con ${selectedIncidentId}.`,
      tone: 'success',
    });
  };

  const handleViewIncident = () => {
    const incidentId = selectedPacket?.incidentId || selectedIncidentId;
    if (incidentId) {
      navigate(getRouteHash('incident', { id: incidentId }));
    }
  };

  const handleInspectPacket = (packet) => {
    selectTrafficPacket(packet.id, packet.src || packet.dst);
    setCreateSeverity(packet.severity || 'medium');
    setCreateModalOpen(true);
  };

  const renderPayload = () => {
    if (!detail?.payloadHex) {
      return <p className="traffic-placeholder">Sin payload disponible.</p>;
    }
    const hex = detail.payloadHex.slice(0, 2048);
    const ascii = detail.payloadAscii ? detail.payloadAscii.slice(0, 512) : '';
    return (
      <div className="payload-viewer">
        <div>
          <h4>Hex</h4>
          <pre>{hex}</pre>
        </div>
        <div>
          <h4>ASCII</h4>
          <pre>{ascii}</pre>
        </div>
      </div>
    );
  };

  return (
    <section className="monitor-traffic" aria-label="Monitor de tráfico en tiempo real">
      <header className="monitor-toolbar">
        <div className="toolbar-group">
          <label>
            Protocolo
            <select value={traffic.filters.protocol} onChange={handleProtocolChange}>
              {PROTOCOLS.map((protocol) => (
                <option key={protocol} value={protocol}>
                  {protocol}
                </option>
              ))}
            </select>
          </label>
          <label>
            Severidad
            <select value={traffic.filters.severity} onChange={handleSeverityChange}>
              {SEVERITIES.map((severity) => (
                <option key={severity} value={severity}>
                  {severity === 'ALL' ? 'Todas' : severity}
                </option>
              ))}
            </select>
          </label>
          <label className="search-inline">
            Buscar
            <input
              type="search"
              placeholder="IP, puerto o texto"
              value={traffic.filters.search}
              onChange={handleSearchChange}
            />
          </label>
        </div>
        <div className="toolbar-group align-end">
          <span className="status-indicator" data-status={connectionStatus}>
            {connectionStatus}
          </span>
          <button type="button" className="btn subtle" onClick={handleModeToggle}>
            {traffic.mode === 'ws' ? 'Cambiar a polling' : 'Cambiar a realtime'}
          </button>
          {isStreaming && (
            <button type="button" className="btn danger" onClick={handleStopStream}>
              🛑 Detener tráfico
            </button>
          )}
          <label>
            Muestreo
            <select value={traffic.pollingInterval} onChange={(event) => setTrafficPollingInterval(Number(event.target.value))}>
              <option value={1000}>1s</option>
              <option value={2000}>2s</option>
              <option value={5000}>5s</option>
            </select>
          </label>
          <button type="button" className="btn subtle" onClick={handlePauseToggle}>
            {traffic.paused ? 'Reanudar' : 'Pausar'}
          </button>
          <button
            type="button"
            className="btn primary"
            onClick={() => setCreateModalOpen(true)}
            disabled={!selectedPacket}
          >
            Crear incidente desde paquete
          </button>
        </div>
      </header>

      <div className="monitor-body">
        <div className="traffic-list" ref={listRef} role="list" aria-label="Paquetes capturados">
          <div style={{ height: paddingTop }} aria-hidden="true" />
          {visiblePackets.map((packet, index) => (
            <PacketRow
              key={packet.id}
              packet={packet}
              index={start + index}
              selected={packet.id === traffic.selectedPacketId}
              onSelect={handleSelectPacket}
              onInspect={handleInspectPacket}
            />
          ))}
          <div style={{ height: paddingBottom }} aria-hidden="true" />
          {!filteredPackets.length ? (
            <div className="traffic-placeholder">Sin paquetes que coincidan con los filtros.</div>
          ) : null}
        </div>

        <aside className="traffic-detail" aria-live="polite">
          <header>
            <h3>Detalle del paquete</h3>
            {selectedPacket ? (
              <span>
                {selectedPacket.id} · {selectedPacket.proto}
              </span>
            ) : (
              <span>Selecciona un paquete para ver detalle</span>
            )}
          </header>
          {detailLoading ? (
            <Loader label="Cargando detalle" />
          ) : selectedPacket ? (
            <div className="detail-content">
              <dl className="detail-grid">
                <div>
                  <dt>Timestamp</dt>
                  <dd>
                    <time dateTime={selectedPacket.timestamp}>{new Date(selectedPacket.timestamp).toLocaleString()}</time>
                  </dd>
                </div>
                <div>
                  <dt>Origen</dt>
                  <dd>
                    {selectedPacket.src}:{selectedPacket.srcPort}
                  </dd>
                </div>
                <div>
                  <dt>Destino</dt>
                  <dd>
                    {selectedPacket.dst}:{selectedPacket.dstPort}
                  </dd>
                </div>
                <div>
                  <dt>Severidad</dt>
                  <dd className={`severity-tag ${selectedPacket.severity}`}>{selectedPacket.severity}</dd>
                </div>
                <div>
                  <dt>Longitud</dt>
                  <dd>{selectedPacket.length} bytes</dd>
                </div>
                <div>
                  <dt>Detección</dt>
                  <dd>
                    {detectionModelLabel || detectionModelScore !== undefined ? (
                      <span className="detection-badge" title={`Modelo ${detectionModelLabel || '—'}${
                        detectionModelVersion ? ` · v${detectionModelVersion}` : ''
                      }${detectionModelScore !== undefined ? ` · score ${detectionModelScore}` : ''}`}>
                        {detectionModelLabel || '—'}
                        {detectionModelScore !== undefined ? ` (${detectionModelScore})` : ''}
                      </span>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
                {detail?.layers ? (
                  <div>
                    <dt>Capas</dt>
                    <dd>
                      <ul>
                        {detail.layers.map((layer, index) => (
                          <li key={`${layer.type}-${index}`}>{`${layer.type} ${layer.protocol || ''}`}</li>
                        ))}
                      </ul>
                    </dd>
                  </div>
                ) : null}
              </dl>
              {renderPayload()}
              <div className="detail-graph">
                <TrafficCanvas packets={traffic.packets} />
              </div>
              <div className="detail-actions">
                <label>
                  Vincular a incidente
                  <select value={selectedIncidentId} onChange={(event) => setSelectedIncidentId(event.target.value)}>
                    <option value="">Selecciona incidente</option>
                    {incidents.map((incident) => (
                      <option key={incident.id} value={incident.id}>
                        {incident.id} · {incident.type || incident.status}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="detail-buttons">
                  <button type="button" className="btn subtle" onClick={handleLinkToIncident} disabled={!selectedIncidentId}>
                    Marcar relacionado
                  </button>
                  <button type="button" className="btn warn" onClick={handleViewIncident} disabled={!selectedPacket}>
                    Ver en incidentes
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="traffic-placeholder">Selecciona un paquete para ver más información.</div>
          )}
        </aside>
      </div>

      <Modal
        open={createModalOpen}
        title="Crear incidente desde paquete"
        description="Completa la información para generar un incidente basado en el tráfico seleccionado."
        onClose={() => setCreateModalOpen(false)}
        actions={
          <>
            <button type="button" className="btn subtle" onClick={() => setCreateModalOpen(false)}>
              Cancelar
            </button>
            <button type="submit" form="create-incident-form" className="btn primary" disabled={!selectedPacket}>
              Crear incidente
            </button>
          </>
        }
      >
        <form id="create-incident-form" className="create-incident-form" onSubmit={handleCreateIncident}>
          <label>
            Severidad
            <select value={createSeverity} onChange={(event) => setCreateSeverity(event.target.value)}>
              <option value="critical">Crítica</option>
              <option value="high">Alta</option>
              <option value="medium">Media</option>
              <option value="low">Baja</option>
            </select>
          </label>
          <label>
            Motivo / resumen
            <textarea
              rows={3}
              value={createReason}
              onChange={(event) => setCreateReason(event.target.value)}
              placeholder="Describe por qué este tráfico amerita un incidente."
              required
            />
          </label>
        </form>
      </Modal>
    </section>
  );
}

export default MonitorTraffic;
