import { memo, useMemo } from 'react';

const WINDOW_SECONDS = 45;

const getTimestamp = (value) => {
  try {
    return new Date(value).getTime();
  } catch (error) {
    return Date.now();
  }
};

const TrafficCanvas = memo(function TrafficCanvas({ packets = [] }) {
  const { points, maxCount } = useMemo(() => {
    if (!packets.length) {
      return { points: [], maxCount: 0 };
    }
    const latest = getTimestamp(packets[packets.length - 1].timestamp);
    const min = latest - WINDOW_SECONDS * 1000;
    const buckets = new Map();
    packets.forEach((packet) => {
      const ts = Math.max(getTimestamp(packet.timestamp), min);
      const key = Math.floor((ts - min) / 1000);
      buckets.set(key, (buckets.get(key) || 0) + 1);
    });
    const allPoints = Array.from({ length: WINDOW_SECONDS }).map((_, index) => {
      const value = buckets.get(index) || 0;
      return { x: index, value };
    });
    const maxValue = allPoints.reduce((max, point) => (point.value > max ? point.value : max), 0);
    return { points: allPoints, maxCount: maxValue };
  }, [packets]);

  const height = 60;
  const width = 160;
  const stepX = width / Math.max(points.length - 1, 1);
  const scaleY = maxCount ? height / maxCount : 0;

  const pathD = points
    .map((point, index) => {
      const x = Math.round(index * stepX * 10) / 10;
      const y = height - point.value * scaleY;
      return `${index === 0 ? 'M' : 'L'}${x},${Number.isFinite(y) ? y : height}`;
    })
    .join(' ');

  return (
    <svg className="traffic-canvas" role="img" aria-label="Histograma de paquetes recientes" viewBox={`0 0 ${width} ${height}`}>
      <path d="M0,60 L160,60" className="traffic-axis" />
      <path d={pathD || 'M0,60 L160,60'} className="traffic-line" />
      {points.map((point, index) => {
        const barHeight = point.value * scaleY;
        const x = index * stepX;
        return (
          <rect
            key={index}
            x={x}
            y={height - barHeight}
            width={stepX * 0.7}
            height={barHeight}
            className="traffic-bar"
          />
        );
      })}
    </svg>
  );
});

export default TrafficCanvas;
