const PROTOCOLS = ['TCP', 'UDP', 'ICMP', 'HTTP', 'HTTPS', 'DNS', 'SSL'];
const SEVERITIES = ['low', 'medium', 'high', 'critical'];

const randomBetween = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (list) => list[randomBetween(0, list.length - 1)];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toHex = (value) => Array.from(textEncoder.encode(value)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => {
  if (!hex) return '';
  const pairs = hex.match(/.{1,2}/g) || [];
  const bytes = new Uint8Array(pairs.map((pair) => parseInt(pair, 16)));
  return textDecoder.decode(bytes);
};

const ipBlock = () => `${randomBetween(1, 254)}.${randomBetween(0, 255)}.${randomBetween(0, 255)}.${randomBetween(1, 254)}`;

const config = {
  burstMin: Number(import.meta?.env?.VITE_MOCK_TRAFFIC_MIN_BATCH || 1),
  burstMax: Number(import.meta?.env?.VITE_MOCK_TRAFFIC_MAX_BATCH || 3),
  seedSize: Number(import.meta?.env?.VITE_MOCK_TRAFFIC_SEED || 120),
  bufferSize: Number(import.meta?.env?.VITE_MOCK_TRAFFIC_BUFFER || 1200),
};

const mockTrafficState = {
  packets: [],
  alerts: [],
  incidents: ['INC-1001', 'INC-1002', 'INC-1003'],
};

const listeners = new Set();
let socketTimer = null;

const generatePacket = () => {
  const proto = pick(PROTOCOLS);
  const length = randomBetween(60, 1800);
  const timestamp = new Date(Date.now() - randomBetween(0, 2000)).toISOString();
  const id = `PKT-${String(Date.now())}-${Math.random().toString(16).slice(2, 6)}`;
  const src = ipBlock();
  const dst = ipBlock();
  const payload = toHex(`Mock payload ${id}`).slice(0, 2048);
  const info =
    proto === 'HTTP'
      ? `GET /${randomBetween(10, 999)}`
      : proto === 'HTTPS'
        ? 'TLS handshake'
        : proto === 'DNS'
          ? `Query A ${dst}`
          : proto === 'TCP'
            ? `SYN ${src.split('.')[0]}`
            : 'Frame';

  const severityRoll = Math.random();
  const severity =
    severityRoll > 0.97
      ? 'critical'
      : severityRoll > 0.9
        ? 'high'
        : severityRoll > 0.7
          ? 'medium'
          : 'low';

  return {
    id,
    timestamp,
    src,
    srcPort: randomBetween(1024, 65535),
    dst,
    dstPort: [80, 443, 53, 22, 3389][randomBetween(0, 4)],
    proto,
    length,
    info,
    payload,
    severity,
    incidentId: null,
  };
};

const pushPacket = (packet) => {
  mockTrafficState.packets.push(packet);
  if (mockTrafficState.packets.length > config.bufferSize) {
    mockTrafficState.packets.splice(0, mockTrafficState.packets.length - config.bufferSize);
  }
};

const emit = (event) => {
  listeners.forEach((listener) => listener(event));
};

const maybeEmitAlert = (packet) => {
  if (packet.severity === 'critical' || (packet.severity === 'high' && Math.random() > 0.6)) {
    const incidentId = pick(mockTrafficState.incidents);
    const alert = {
      packetId: packet.id,
      incidentId,
      severity: packet.severity,
    };
    mockTrafficState.alerts.push(alert);
    emit({ type: 'alert', alert });
  }
};

const startSocketLoop = () => {
  if (socketTimer) return;
  socketTimer = setInterval(() => {
    const batchSize = randomBetween(config.burstMin, config.burstMax);
    const batch = Array.from({ length: batchSize }).map(() => {
      const packet = generatePacket();
      pushPacket(packet);
      maybeEmitAlert(packet);
      return packet;
    });
    emit({ type: 'packet_batch', packets: batch });
  }, randomBetween(350, 650));
};

export function createMockTrafficSocket() {
  let isOpen = false;

  const socket = {
    readyState: 0,
    close() {
      listeners.delete(socket._handleMessage);
      if (listeners.size === 0 && socketTimer) {
        clearInterval(socketTimer);
        socketTimer = null;
      }
      isOpen = false;
      socket.readyState = 3;
    },
    send() {},
  };

  socket._handleMessage = (message) => {
    if (socket.onmessage) {
      socket.onmessage({ data: JSON.stringify(message) });
    }
  };

  setTimeout(() => {
    isOpen = true;
    socket.readyState = 1;
    listeners.add(socket._handleMessage);
    startSocketLoop();
    if (socket.onopen) socket.onopen();
  }, randomBetween(100, 250));

  socket.onerror = null;
  socket.onclose = null;
  socket.onopen = null;
  socket.onmessage = null;

  return socket;
}

export async function mockFetchRecentTraffic({ since, limit = 100 }) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const filtered = since
        ? mockTrafficState.packets.filter((packet) => new Date(packet.timestamp).getTime() > Number(since))
        : mockTrafficState.packets.slice(-limit);
      resolve(filtered.slice(-limit));
    }, randomBetween(80, 200));
  });
}

export async function mockFetchPacketDetail(id) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const packet = mockTrafficState.packets.find((item) => item.id === id);
      if (!packet) {
        reject(new Error(`Paquete ${id} no encontrado`));
        return;
      }
      resolve({
        ...packet,
        layers: [
          { type: 'ethernet', src: '00:1A:2B:3C:4D:5E', dst: '00:1F:5B:7A:9C:2D' },
          { type: 'ip', version: 4, ttl: randomBetween(40, 128) },
          { type: 'transport', protocol: packet.proto, window: randomBetween(128, 4096) },
        ],
        payloadHex: packet.payload,
        payloadAscii: fromHex(packet.payload),
      });
    }, randomBetween(60, 120));
  });
}

export async function mockCreateIncidentFromPacket({ packetId, reason, severity }) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      const packet = mockTrafficState.packets.find((item) => item.id === packetId);
      if (!packet) {
        reject(new Error('Paquete no encontrado'));
        return;
      }
      const newIncidentId = `INC-${randomBetween(4000, 9999)}`;
      mockTrafficState.incidents.push(newIncidentId);
      packet.incidentId = newIncidentId;
      resolve({ incidentId: newIncidentId, packetId, reason, severity, createdAt: new Date().toISOString() });
    }, randomBetween(100, 200));
  });
}

export function seedMockTraffic(initial = config.seedSize) {
  if (mockTrafficState.packets.length) return mockTrafficState.packets;
  for (let index = 0; index < initial; index += 1) {
    const packet = generatePacket();
    pushPacket(packet);
  }
  return mockTrafficState.packets;
}

seedMockTraffic();
