const LATENCY_MIN = 300;
const LATENCY_MAX = 700;

const randomDelay = () =>
  new Promise((resolve) =>
    setTimeout(resolve, Math.floor(Math.random() * (LATENCY_MAX - LATENCY_MIN)) + LATENCY_MIN),
  );

const clone = (value) => structuredClone(value);

const mockDb = {
  incidents: [
    {
      id: 'INC-1001',
      type: 'SQLi',
      status: 'conocido',
      severity: 'alta',
      source: '10.0.1.23',
      createdAt: '2025-10-28T14:12:00Z',
      aiSummary:
        'Solicitud inyectada detectada en el módulo de inscripciones. Se bloqueó automáticamente y se aplicaron reglas WAF adicionales.',
      timeline: [
        { label: 'Detectado', timestamp: '2025-10-28T14:12:15Z' },
        { label: 'Clasificado', timestamp: '2025-10-28T14:15:00Z' },
        { label: 'Respuesta aplicada', timestamp: '2025-10-28T14:20:42Z' },
      ],
      relatedAssets: ['portal-inscripciones', 'db-academica'],
    },
    {
      id: 'INC-1002',
      type: 'DDoS',
      status: 'no-conocido',
      severity: 'critica',
      source: '203.0.113.9',
      createdAt: '2025-10-29T02:45:00Z',
      aiSummary:
        'Ataque distribuido con picos de 3.5 Gbps dirigido al portal público. Se están correlacionando patrones con botnets conocidas.',
      timeline: [
        { label: 'Detectado', timestamp: '2025-10-29T02:45:21Z' },
        { label: 'Clasificado', timestamp: '2025-10-29T02:47:32Z' },
      ],
      relatedAssets: ['portal-publico', 'cdn-principal'],
    },
    {
      id: 'INC-1003',
      type: 'XSS',
      status: 'falso-positivo',
      severity: 'media',
      source: '172.16.0.50',
      createdAt: '2025-10-29T09:05:00Z',
      aiSummary:
        'Se detectó carga sospechosa en formulario de comentarios. La evidencia apunta a una herramienta de QA interna.',
      timeline: [
        { label: 'Detectado', timestamp: '2025-10-29T09:05:12Z' },
        { label: 'Clasificado', timestamp: '2025-10-29T09:08:55Z' },
      ],
      relatedAssets: ['portal-biblioteca'],
    },
  ],
  warRooms: new Map(),
  warRoomMessages: new Map(),
};

const mockAuthState = {
  user: null,
  pendingTicket: null,
  requireMfa: true,
  email: 'analista@ids.campus',
  name: 'Analista IDS',
  token: null,
  expiresAt: null,
};

const ensureMockToken = () => {
  const expiresIn = 3600;
  mockAuthState.token = `mock-token-${Date.now()}`;
  mockAuthState.expiresAt = Date.now() + expiresIn * 1000;
  return {
    token: mockAuthState.token,
    expiresIn,
  };
};

const ensureWarRoom = (incidentId) => {
  if (mockDb.warRooms.has(incidentId)) {
    return mockDb.warRooms.get(incidentId);
  }
  const warRoom = {
    id: `WR-${incidentId}`,
    incidentId,
    status: 'in_progress',
    updatedAt: new Date().toISOString(),
    checklist: [
      { id: 'validate-telemetry', label: 'Validar telemetría de IDS', done: false },
      { id: 'contact-netsec', label: 'Notificar a Ingeniería de redes', done: false },
      { id: 'notify-rectoria', label: 'Enviar reporte preliminar a rectoría', done: false },
    ],
  };
  mockDb.warRooms.set(incidentId, warRoom);
  mockDb.warRoomMessages.set(warRoom.id, [
    {
      id: `${warRoom.id}-assistant-1`,
      role: 'assistant',
      content: 'Iniciando mesa de trabajo. ¿Cuál es el principal síntoma observado?',
      createdAt: new Date().toISOString(),
    },
  ]);
  return warRoom;
};

const applyFilters = (incidents, filters = {}) => {
  const { query, status, severity, from, to } = filters;
  return incidents.filter((incident) => {
    const matchesQuery =
      !query ||
      incident.id.toLowerCase().includes(query.toLowerCase()) ||
      incident.type.toLowerCase().includes(query.toLowerCase()) ||
      incident.source.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = !status || incident.status === status;
    const matchesSeverity = !severity || incident.severity === severity;
    const created = new Date(incident.createdAt).getTime();
    const matchesFrom = !from || created >= new Date(from).getTime();
    const matchesTo = !to || created <= new Date(to).getTime();
    return matchesQuery && matchesStatus && matchesSeverity && matchesFrom && matchesTo;
  });
};

const withLatency = async (fn) => {
  await randomDelay();
  return fn();
};

export async function mockFetchIncidents(filters) {
  return withLatency(() => {
    const filtered = applyFilters(mockDb.incidents, filters);
    const limit = Number(import.meta?.env?.VITE_MOCK_INCIDENT_LIMIT || 5);
    return clone(filtered.slice(0, limit));
  });
}

export async function mockFetchIncidentById(id) {
  return withLatency(() => {
    const incident = mockDb.incidents.find((item) => item.id === id);
    if (!incident) {
      throw new Error(`Incidente ${id} no encontrado`);
    }
    const warRoom = mockDb.warRooms.get(id);
    return clone({
      ...incident,
      warRoomId: warRoom ? warRoom.id : null,
      notes:
        incident.status === 'conocido'
          ? 'Patrón coincide con incidente de agosto 2025. Se aplicó playbook automático.'
          : 'Información en curso. Documenta hallazgos relevantes aquí.',
    });
  });
}

export async function mockPostIncidentAction(id, action) {
  return withLatency(() => {
    const incident = mockDb.incidents.find((item) => item.id === id);
    if (!incident) {
      throw new Error(`Incidente ${id} no encontrado`);
    }
    switch (action) {
      case 'close_fp':
        incident.status = 'cerrado';
        incident.severity = 'baja';
        incident.closedAt = new Date().toISOString();
        break;
      case 'escalate':
        incident.status = 'no-conocido';
        incident.severity = 'critica';
        incident.escalatedAt = new Date().toISOString();
        break;
      case 'mark_contained':
        incident.status = 'contenido';
        incident.severity = 'media';
        incident.containedAt = new Date().toISOString();
        break;
      default:
        throw new Error(`Acción no soportada: ${action}`);
    }
    incident.updatedAt = new Date().toISOString();
    return clone(incident);
  });
}

export async function mockOpenWarRoom(incidentId) {
  return withLatency(() => clone(ensureWarRoom(incidentId)));
}

export async function mockFetchWarRoomMessages(warRoomId) {
  return withLatency(() => {
    const messages = mockDb.warRoomMessages.get(warRoomId) || [];
    return clone(messages);
  });
}

export async function mockPostWarRoomMessage(warRoomId, payload) {
  return withLatency(() => {
    const messages = mockDb.warRoomMessages.get(warRoomId) || [];
    const createdAt = new Date().toISOString();
    const userMessage = {
      id: `${warRoomId}-user-${Date.now()}`,
      role: 'user',
      content: payload.content,
      createdAt,
    };
    messages.push(userMessage);

    const assistantMessage = {
      id: `${warRoomId}-assistant-${Date.now()}`,
      role: 'assistant',
      content:
        'He actualizado el registro y sugiero correlacionar con logs de firewall en los últimos 15 minutos.',
      createdAt: new Date().toISOString(),
    };
    messages.push(assistantMessage);
    mockDb.warRoomMessages.set(warRoomId, messages);
    return clone({ userMessage, assistantMessage });
  });
}

export async function mockAuthStartGoogle() {
  return withLatency(() => {
    mockAuthState.pendingTicket = 'mock-ticket';
    return { initiated: true };
  });
}

export async function mockAuthFetchMe() {
  return withLatency(() => {
    if (mockAuthState.user) {
      return clone(mockAuthState.user);
    }
    if (mockAuthState.pendingTicket) {
      return { mfa_required: true, mfa_ticket: mockAuthState.pendingTicket };
    }
    return null;
  });
}

export async function mockAuthFetchSessionStatus() {
  return withLatency(() => {
    if (mockAuthState.user) {
      const { token, expiresIn } = ensureMockToken();
      return {
        access_token: token,
        token_type: 'Bearer',
        expires_in: expiresIn,
        user: clone(mockAuthState.user),
      };
    }
    if (mockAuthState.pendingTicket) {
      return { mfa_required: true, mfa_ticket: mockAuthState.pendingTicket };
    }
    return null;
  });
}

export async function mockAuthVerifyTotp(ticket, code) {
  return withLatency(() => {
    if (!mockAuthState.pendingTicket || ticket !== mockAuthState.pendingTicket) {
      throw new Error('Ticket inválido o expirado');
    }
    if (code !== '123456') {
      throw new Error('Código incorrecto. Usa 123456 en el mock.');
    }
    mockAuthState.user = {
      id: 'user-1',
      email: mockAuthState.email,
      name: mockAuthState.name,
      picture: 'https://avatars.dicebear.com/api/initials/IDS.svg',
    };
    const { token, expiresIn } = ensureMockToken();
    mockAuthState.pendingTicket = null;
    return {
      access_token: token,
      token_type: 'Bearer',
      expires_in: expiresIn,
      user: clone(mockAuthState.user),
    };
  });
}

export async function mockAuthLogout() {
  return withLatency(() => {
    mockAuthState.user = null;
    mockAuthState.pendingTicket = null;
    mockAuthState.token = null;
    mockAuthState.expiresAt = null;
    return { ok: true };
  });
}
