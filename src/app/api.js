import {
  mockFetchIncidentById,
  mockFetchIncidents,
  mockPostIncidentAction,
  mockOpenWarRoom,
  mockFetchWarRoomMessages,
  mockPostWarRoomMessage,
  mockAuthStartGoogle,
  mockAuthFetchMe,
  mockAuthFetchSessionStatus,
  mockAuthVerifyTotp,
  mockAuthLogout,
} from './api.mock.js';
import {
  mockFetchRecentTraffic,
  mockFetchPacketDetail,
  mockCreateIncidentFromPacket,
  createMockTrafficSocket,
} from './mocks/traffic.mock.js';
import { initGoogle, requestIdToken } from './googleAuth.js';

const DEFAULT_HEADERS = { 'Content-Type': 'application/json' };
const USE_MOCKS = import.meta?.env?.VITE_USE_MOCKS === 'true';

let authToken = null;

export function setAuthToken(token) {
  authToken = token || null;
}

const shouldUseMock = (baseUrl) => USE_MOCKS || !baseUrl || !baseUrl.trim();

const toUrl = (baseUrl, path, params) => {
  const normalized = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const url = new URL(path.replace(/^\//, ''), normalized);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '' || Number.isNaN(value)) return;
      url.searchParams.set(key, value);
    });
  }
  return url;
};

const handleResponse = async (response) => {
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Error ${response.status}`);
  }
  if (response.status === 204) {
    return null;
  }
  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
};

const request = async (url, init = {}) => {
  try {
    const headers = new Headers(init.headers || {});
    if (authToken) {
      headers.set('Authorization', `Bearer ${authToken}`);
    }
    const response = await fetch(url, {
      credentials: init.credentials ?? 'include',
      ...init,
      headers,
    });
    return handleResponse(response);
  } catch (error) {
    throw new Error(error?.message || 'Error al conectar con el backend');
  }
};

// --- Autenticación --------------------------------------------------------

export async function authStartGoogle(baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockAuthStartGoogle();
  }
  
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  
  if (!clientId) {
    throw new Error('Google Client ID not configured. Set VITE_GOOGLE_CLIENT_ID in .env file and restart the dev server.');
  }

  // Initialize Google Sign-In
  initGoogle(clientId);

  // Request the id_token from Google
  const idToken = await requestIdToken({ timeoutMs: 60000 });

  // Send the id_token to our backend for validation and JWT generation
  const url = toUrl(baseUrl, '/api/auth/google');
  return request(url, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ idToken }),
  });
}export async function authFetchMe(baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockAuthFetchMe();
  }
  const url = toUrl(baseUrl, '/api/auth/me');
  return request(url, { method: 'GET' });
}

export async function authFetchSessionStatus(baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockAuthFetchSessionStatus();
  }
  // Backend_IDS does not implement legacy session polling (`/auth/session/status`).
  // Return null to indicate no server-side session polling is available. Callers
  // should use GET /api/auth/me after obtaining a backend token instead.
  return null;
}

export async function authVerifyTotp(ticket, code, baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockAuthVerifyTotp(ticket, code);
  }
  // Backend_IDS currently does not support TOTP/MFA verification endpoints.
  // Surface a clear error so the UI can handle it gracefully.
  throw new Error('MFA/TOTP verification is not supported by Backend_IDS');
}

export async function authLogout(baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockAuthLogout();
  }
  // Backend_IDS does not expose a logout endpoint. Perform a no-op successful
  // response so the UI can continue to clear local state without error.
  return { ok: true };
}

// --- Incidentes -----------------------------------------------------------

export async function getIncidents(filters = {}, baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockFetchIncidents(filters);
  }
  const url = toUrl(baseUrl, '/incidents', {
    query: filters.query,
    status: filters.status,
    severity: filters.severity,
    from: filters.from,
    to: filters.to,
    filter_by_ip: filters.filterByIp,
    packet_id: filters.packetId,
  });
  const response = await request(url, { method: 'GET' });
  // Backend returns paginated response: {items: [...], page: 0, size: 20, total: 3}
  // Extract just the items array for compatibility with existing code
  return response?.items || [];
}

export async function getIncidentById(id, baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockFetchIncidentById(id);
  }
  const url = toUrl(baseUrl, `/incidents/${id}`);
  return request(url, { method: 'GET' });
}

export async function postIncidentAction(id, body, baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockPostIncidentAction(id, body?.action);
  }
  const url = toUrl(baseUrl, `/incidents/${id}/actions`);
  return request(url, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(body),
  });
}

export async function postIncidentFromPacket(packetId, reason, severity, baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockCreateIncidentFromPacket({ packetId, reason, severity });
  }
  const url = toUrl(baseUrl, '/incidents/from-packet');
  return request(url, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify({ packetId, reason, severity }),
  });
}

export async function postIncidentWarRoom(id, baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockOpenWarRoom(id);
  }
  const url = toUrl(baseUrl, `/incidents/${id}/war-room`);
  return request(url, { method: 'POST' });
}

// --- War Room -------------------------------------------------------------

export async function getWarRoomMessages(warRoomId, baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockFetchWarRoomMessages(warRoomId);
  }
  const url = toUrl(baseUrl, `/war-room/${warRoomId}/messages`);
  return request(url, { method: 'GET' });
}

export async function postWarRoomMessage(warRoomId, message, baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockPostWarRoomMessage(warRoomId, message);
  }
  const url = toUrl(baseUrl, `/war-room/${warRoomId}/messages`);
  return request(url, {
    method: 'POST',
    headers: DEFAULT_HEADERS,
    body: JSON.stringify(message),
  });
}

// --- Tráfico --------------------------------------------------------------

export async function getTrafficRecent({ since, limit } = {}, baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockFetchRecentTraffic({ since, limit });
  }
  const url = toUrl(baseUrl, '/traffic/recent', {
    since,
    limit,
  });
  return request(url, { method: 'GET' });
}

export async function getTrafficPacketById(packetId, baseUrl) {
  if (shouldUseMock(baseUrl)) {
    return mockFetchPacketDetail(packetId);
  }
  const url = toUrl(baseUrl, `/traffic/packets/${packetId}`);
  return request(url, { method: 'GET' });
}

// --- WebSocket ------------------------------------------------------------

export function connectTrafficStream(baseUrl, onEvent, { onOpen, onClose, onError } = {}) {
  const useMock = shouldUseMock(baseUrl);

  if (useMock) {
    const socket = createMockTrafficSocket();
    socket.onopen = () => onOpen?.();
    socket.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type) {
          onEvent?.(payload.type, payload);
        }
      } catch (error) {
        console.warn('Mock packet parse error', error);
      }
    };
    socket.onclose = () => onClose?.();
    socket.onerror = (error) => onError?.(error);
    return {
      close() {
        socket.close();
      },
    };
  }

  let closedExplicitly = false;
  let currentSocket = null;
  let retryTimer = null;

  const buildWsUrl = () => {
    const normalized = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    let target = normalized.replace(/^http/, 'ws') + '/traffic/stream';
    if (authToken) {
      const separator = target.includes('?') ? '&' : '?';
      target = `${target}${separator}token=${encodeURIComponent(authToken)}`;
    }
    return target;
  };

  const setupSocket = () => {
    if (closedExplicitly) return;
    try {
      currentSocket = new WebSocket(buildWsUrl());
    } catch (error) {
      onError?.(error);
      scheduleReconnect();
      return;
    }

    currentSocket.addEventListener('open', () => {
      onOpen?.();
    });

    currentSocket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload?.type) {
          onEvent?.(payload.type, payload);
        }
      } catch (error) {
        console.warn('Traffic stream parse error', error);
      }
    });

    currentSocket.addEventListener('close', () => {
      onClose?.();
      if (!closedExplicitly) {
        scheduleReconnect();
      }
    });

    currentSocket.addEventListener('error', () => {
      onError?.();
      if (!closedExplicitly) {
        currentSocket?.close();
      }
    });
  };

  const scheduleReconnect = () => {
    if (retryTimer || closedExplicitly) return;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      setupSocket();
    }, 5000);
  };

  setupSocket();

  return {
    close() {
      closedExplicitly = true;
      if (retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
      }
      currentSocket?.close();
    },
  };
}

// --- Exports agrupados (legacy compatibility) -----------------------------

export const api = {
  authStartGoogle,
  authFetchMe,
  authFetchSessionStatus,
  authVerifyTotp,
  authLogout,
  getIncidents,
  getIncidentById,
  postIncidentAction,
  postIncidentFromPacket,
  postIncidentWarRoom,
  getWarRoomMessages,
  postWarRoomMessage,
  getTrafficRecent,
  getTrafficPacketById,
  connectTrafficStream,
};

export default api;
