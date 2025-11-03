import { memo, useMemo } from 'react';

const severityClass = {
  critical: 'is-critical',
  high: 'is-high',
  medium: 'is-medium',
  low: 'is-low',
};

const formatTime = (timestamp) => {
  try {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
    });
  } catch (error) {
    return timestamp;
  }
};

const PacketRow = memo(function PacketRow({ packet, index, selected, onSelect, onInspect }) {
  const rowClassName = useMemo(() => {
    const classes = ['traffic-row'];
    if (selected) classes.push('is-selected');
    if (packet?.severity) classes.push(severityClass[packet.severity] || '');
    if (packet?.incidentId) classes.push('is-linked');
    return classes.join(' ');
  }, [packet?.severity, packet?.incidentId, selected]);

  const alertLabel = packet.incidentId ? `Relacionado con ${packet.incidentId}` : undefined;
  const modelLabel = packet.model_label || packet.detection?.model_label;
  const modelScore = packet.model_score ?? packet.detection?.model_score;
  const modelVersion = packet.model_version ?? packet.detection?.model_version;
  const detectionDisplay = modelLabel ? `${modelLabel}${modelScore !== undefined ? ` (${modelScore})` : ''}` : '—';
  const detectionTitle = modelLabel
    ? `Modelo: ${modelLabel}${modelVersion ? ` · versión ${modelVersion}` : ''}${
        modelScore !== undefined ? ` · score ${modelScore}` : ''
      }`
    : 'Sin datos de modelo';

  return (
    <button
      type="button"
      className={rowClassName}
      onClick={() => onSelect(packet)}
      onDoubleClick={() => onInspect?.(packet)}
      title={packet.info}
    >
      <span className="cell index" aria-hidden="true">
        {index + 1}
      </span>
      <span className="cell time">
        <time dateTime={packet.timestamp}>{formatTime(packet.timestamp)}</time>
      </span>
      <span className="cell endpoint" title={`${packet.src}:${packet.srcPort}`}>
        {packet.src}:{packet.srcPort}
      </span>
      <span className="cell endpoint" title={`${packet.dst}:${packet.dstPort}`}>
        {packet.dst}:{packet.dstPort}
      </span>
      <span className="cell proto">{packet.proto}</span>
      <span className="cell len">{packet.length}</span>
      <span className="cell detection" title={detectionTitle}>
        {detectionDisplay}
      </span>
      <span className="cell info">{packet.info}</span>
      <span className="cell alert" aria-label={alertLabel}>
        {packet.incidentId ? (
          <a 
            href={`#/incident/${packet.incidentId}`} 
            className="link packet-alert"
            onClick={(e) => e.stopPropagation()}
            title="Ver incidente relacionado"
          >
            Ver incidente
          </a>
        ) : null}
      </span>
    </button>
  );
});

export default PacketRow;
