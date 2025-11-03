import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useAppActions, useAppState } from '../app/state.js';
import { getRouteHash, navigate } from '../app/router.js';
import { connectTrafficStream } from '../app/api.js';
import StatCard from '../components/StatCard.jsx';
import Table from '../components/Table.jsx';
import Tag from '../components/Tag.jsx';
import Pill from '../components/Pill.jsx';
import SearchBox from '../components/SearchBox.jsx';
import MonitorTraffic from '../components/MonitorTraffic/MonitorTraffic.jsx';

const statusOptions = [
  { value: '', label: 'Todos' },
  { value: 'conocido', label: 'Conocidos' },
  { value: 'no-conocido', label: 'No conocidos' },
  { value: 'falso-positivo', label: 'Falsos positivos' },
];

const severityOptions = [
  { value: '', label: 'Todas' },
  { value: 'critica', label: 'Críticas' },
  { value: 'alta', label: 'Altas' },
  { value: 'media', label: 'Medias' },
  { value: 'baja', label: 'Bajas' },
];

const statusTone = {
  conocido: 'success',
  'no-conocido': 'warn',
  'falso-positivo': 'info',
  cerrado: 'muted',
  contenido: 'success',
};

const severityTone = {
  critica: 'danger',
  alta: 'warn',
  media: 'info',
  baja: 'success',
};

function Dashboard() {
  const { incidents, loading, traffic, settings } = useAppState();
  const { loadIncidents, setTrafficIpFilter, selectTrafficPacket, openWarRoom } = useAppActions();
  const [filters, setFilters] = useState({
    query: '',
    status: '',
    severity: '',
    from: '',
    to: '',
  });
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      loadIncidents(filters);
    }, 250);
    return () => window.clearTimeout(timeoutId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  // Convertir incidentes críticos en alertas
  useEffect(() => {
    const criticalIncidents = incidents
      .filter(i => i.severity === 'critica' || i.severity === 'alta')
      .slice(0, 10)
      .map(incident => ({
        id: incident.id,
        timestamp: incident.createdAt,
        severity: incident.severity,
        incidentId: incident.id,
        packetId: incident.source || 'N/A',
        score: incident.detection?.model_score,
        model_version: incident.detection?.model_version,
      }));
    
    setAlerts(criticalIncidents);
  }, [incidents]);

  const metrics = useMemo(() => {
    const total = incidents.length || 1;
    const now = new Date();
    const startOfDay = new Date(now);
    startOfDay.setHours(0, 0, 0, 0);
    const incidentsToday = incidents.filter(
      (incident) => new Date(incident.createdAt).getTime() >= startOfDay.getTime(),
    ).length;
    const criticalCount = incidents.filter((incident) => incident.severity === 'critica').length;
    const warRoomCount = incidents.filter((incident) => incident.status === 'no-conocido').length;
    const falsePositives = incidents.filter((incident) => incident.status === 'falso-positivo').length;
    return [
      { label: 'Incidentes hoy', value: incidentsToday },
      { label: 'Críticos activos', value: criticalCount, tone: 'danger' },
      { label: 'En mesa de trabajo', value: warRoomCount, tone: 'warn' },
      {
        label: 'Tasa falsos positivos',
        value: `${Math.round((falsePositives / total) * 100)}%`,
        helper: `${falsePositives} de ${total}`,
        tone: 'info',
      },
    ];
  }, [incidents]);

  const columns = useMemo(
    () => [
      { key: 'id', label: 'ID' },
      { key: 'type', label: 'Tipo' },
      { key: 'source', label: 'Origen' },
      {
        key: 'status',
        label: 'Estado',
        render: (value) => <Tag tone={statusTone[value] || 'neutral'}>{value}</Tag>,
      },
      {
        key: 'severity',
        label: 'Severidad',
        render: (value) => <Pill tone={severityTone[value] || 'neutral'}>{value}</Pill>,
      },
      {
        key: 'detection',
        label: 'Detección',
        render: (_, row) => {
          const modelLabel = row.detection?.model_label;
          const modelScore = row.detection?.model_score;
          const modelVersion = row.detection?.model_version;
          if (!modelLabel) return '—';
          return `${modelLabel}${modelScore !== undefined ? ` (${modelScore})` : ''}${
            modelVersion ? ` · v${modelVersion}` : ''
          }`;
        },
      },
      {
        key: 'createdAt',
        label: 'Detectado',
        render: (value) => (
          <time dateTime={value}>{new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
        ),
      },
      {
        key: 'actions',
        label: 'Acciones',
        render: (_, row) => {
          if (row.status === 'no-conocido') {
            return (
              <button
                type="button"
                className="btn-link"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenWarRoom(row.id);
                }}
                title="Abrir mesa de trabajo"
              >
                🚨 Mesa de trabajo
              </button>
            );
          }
          return '—';
        },
      },
    ],
    [],
  );

  const displayIncidents = useMemo(() => {
    if (!traffic.selectedIp) return incidents;
    const target = traffic.selectedIp.toLowerCase();
    return incidents.filter((incident) => {
      const matchesSource = (incident.source || '').toLowerCase().includes(target);
      const matchesNotes = (incident.notes || '').toLowerCase().includes(target);
      const matchesAssets = Array.isArray(incident.relatedAssets)
        ? incident.relatedAssets.some((asset) => asset.toLowerCase().includes(target))
        : false;
      return matchesSource || matchesNotes || matchesAssets;
    });
  }, [incidents, traffic.selectedIp]);

  const handleRangeChange = (field, value) => {
    setFilters((current) => ({ ...current, [field]: value }));
  };

  const handleClearTrafficFilter = () => {
    setTrafficIpFilter(null);
    selectTrafficPacket(null, null);
  };

  const handleOpenWarRoom = async (incidentId) => {
    try {
      const warRoom = await openWarRoom(incidentId);
      const warRoomId = warRoom?.id || warRoom?.warRoomId;
      if (warRoomId) {
        navigate(getRouteHash('war-room', { id: warRoomId }));
      }
    } catch (error) {
      console.error('Error opening war room:', error);
    }
  };

  return (
    <div className="page dashboard-page">
      <section className="page-header">
        <div>
          <h2>Monitoreo de incidentes</h2>
          <p>Busca y filtra los eventos detectados por el IDS universitario.</p>
        </div>
        <SearchBox
          inputId="dashboard-search"
          defaultValue={filters.query}
          onSearch={(query) => setFilters((current) => ({ ...current, query }))}
        />
      </section>

      <section className="filters-bar" aria-label="Filtros de incidentes">
        <div className="filter-group">
          <span className="filter-label">Estado</span>
          <div className="chip-group" role="group" aria-label="Filtrar por estado">
            {statusOptions.map((option) => (
              <button
                key={option.value || 'all-status'}
                type="button"
                className={`chip ${filters.status === option.value ? 'is-active' : ''}`}
                onClick={() => setFilters((current) => ({ ...current, status: option.value }))}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">Severidad</span>
          <div className="chip-group" role="group" aria-label="Filtrar por severidad">
            {severityOptions.map((option) => (
              <button
                key={option.value || 'all-severity'}
                type="button"
                className={`chip ${filters.severity === option.value ? 'is-active' : ''}`}
                onClick={() => setFilters((current) => ({ ...current, severity: option.value }))}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <span className="filter-label">Rango</span>
          <div className="range-inputs">
            <label>
              Desde
              <input
                type="date"
                value={filters.from}
                onChange={(event) => handleRangeChange('from', event.target.value)}
              />
            </label>
            <label>
              Hasta
              <input
                type="date"
                value={filters.to}
                onChange={(event) => handleRangeChange('to', event.target.value)}
              />
            </label>
          </div>
        </div>
      </section>

      <section className="metrics-grid" aria-label="Métricas clave">
        {metrics.map((metric) => (
          <StatCard key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} tone={metric.tone} />
        ))}
      </section>

      <MonitorTraffic />

      <section className="alerts-section" aria-live="polite">
        <header>
          <h3>Alertas de incidentes críticos</h3>
          <span className="alerts-count">
            {alerts.length} alertas activas
          </span>
        </header>
        {alerts.length === 0 ? (
          <p className="alerts-empty">
            No hay incidentes críticos en este momento.
          </p>
        ) : (
          <ul className="alerts-list">
            {alerts.map((alert) => (
              <li key={alert.id} className={`alert-item severity-${alert.severity || 'medium'}`}>
                <div className="alert-header">
                  <Pill tone={severityTone[alert.severity] || 'neutral'}>{alert.severity || 'media'}</Pill>
                  <time dateTime={alert.timestamp}>
                    {new Date(alert.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </time>
                </div>
                <div className="alert-body">
                  <strong>Paquete: {alert.packetId}</strong>
                  {alert.incidentId && <span> → Incidente: {alert.incidentId}</span>}
                  {alert.score !== undefined && <span> · Score: {alert.score}</span>}
                  {alert.model_version && <span> · Modelo v{alert.model_version}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="table-section">
        <header>
          <h3>Incidentes recientes</h3>
          <span>{displayIncidents.length} registros</span>
        </header>
        {traffic.selectedIp ? (
          <div className="traffic-filter-banner">
            <span>
              Filtrando por IP <strong>{traffic.selectedIp}</strong>
            </span>
            <button type="button" className="btn subtle" onClick={handleClearTrafficFilter}>
              Limpiar filtro
            </button>
          </div>
        ) : null}
        <Table
          columns={columns}
          data={displayIncidents}
          loading={loading.incidents}
          onRowClick={(row) => navigate(getRouteHash('incident', { id: row.id }))}
          emptyMessage="No se encontraron incidentes con los filtros actuales."
        />
      </section>
    </div>
  );
}

export default Dashboard;
