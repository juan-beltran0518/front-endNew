import { createContext, createElement, useContext, useEffect, useMemo, useReducer, useRef } from 'react';
import {
  authStartGoogle as authStartGoogleApi,
  authFetchMe as authFetchMeApi,
  authFetchSessionStatus as authFetchSessionStatusApi,
  authVerifyTotp as authVerifyTotpApi,
  authLogout as authLogoutApi,
  getIncidents,
  getIncidentById,
  postIncidentAction,
  postIncidentFromPacket,
  postIncidentWarRoom,
  getWarRoomMessages,
  postWarRoomMessage as apiPostWarRoomMessage,
  getTrafficRecent,
  getTrafficPacketById,
  connectTrafficStream,
  setAuthToken,
} from './api.js';

const AppStateContext = createContext(null);
const AppActionsContext = createContext(null);
const USE_MOCKS = import.meta?.env?.VITE_USE_MOCKS === 'true';
const normalizeBaseUrl = (value) => {
  if (!value) return '';
  return value.trim();
};

const shouldUseMock = (baseUrl) => {
  const normalized = normalizeBaseUrl(baseUrl);
  return USE_MOCKS || !normalized;
};

const envApiBaseUrl = normalizeBaseUrl(import.meta?.env?.VITE_API_BASE_URL);
const DEFAULT_API_BASE_URL = envApiBaseUrl || 'http://localhost:8080';

const STORAGE_KEY = 'ids-settings';
const AUTH_STORAGE_KEY = 'ids-auth';

const defaultSettings = {
  apiBaseUrl: DEFAULT_API_BASE_URL,
  theme: 'auto',
  notifications: true,
  severityThresholds: {
    critica: 90,
    alta: 70,
    media: 45,
    baja: 20,
  },
};

function loadStoredSettings() {
  if (typeof window === 'undefined') return defaultSettings;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw);
    const merged = { ...defaultSettings, ...parsed };
    merged.apiBaseUrl = normalizeBaseUrl(merged.apiBaseUrl) || defaultSettings.apiBaseUrl;
    if (
      merged.apiBaseUrl === 'http://localhost:4000' &&
      defaultSettings.apiBaseUrl !== 'http://localhost:4000'
    ) {
      merged.apiBaseUrl = defaultSettings.apiBaseUrl;
    }
    return merged;
  } catch (error) {
    console.warn('Failed to parse settings from storage', error);
    return defaultSettings;
  }
}

function loadStoredAuth() {
  if (typeof window === 'undefined') {
    return { token: null, user: null };
  }
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      return { token: null, user: null };
    }
    const parsed = JSON.parse(raw);
    return {
      token: typeof parsed?.token === 'string' ? parsed.token : null,
      user: parsed?.user || null,
    };
  } catch (error) {
    console.warn('Failed to parse auth state from storage', error);
    return { token: null, user: null };
  }
}

const persistAuthState = (authState) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        token: authState.token ?? null,
        user: authState.user ?? null,
      }),
    );
  } catch (error) {
    console.warn('Failed to persist auth state', error);
  }
};

const clearAuthState = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (error) {
    console.warn('Failed to clear auth state', error);
  }
};

const initialState = {
  settings: defaultSettings,
  incidents: [],
  selectedIncident: null,
  toasts: [],
  warRooms: {},
  loading: {
    incidents: false,
    incident: false,
    warRoom: false,
  },
  auth: {
    user: null,
    token: null,
    loading: false,
    error: null,
    mfaRequired: false,
    mfaTicket: null,
  },
  traffic: {
    packets: [],
    pendingPackets: [],
    selectedPacketId: null,
    mode: 'ws',
    paused: false,
    pollingInterval: 2000,
    bufferSize: 500,
    lastTimestamp: null,
    filters: {
      protocol: 'ALL',
      severity: 'ALL',
      search: '',
    },
    selectedIp: null,
  },
};

function reducer(state, action) {
  switch (action.type) {
    case 'settings/loaded': {
      return { ...state, settings: action.payload };
    }
    case 'settings/saved': {
      return { ...state, settings: action.payload };
    }
    case 'incidents/loading': {
      return { ...state, loading: { ...state.loading, incidents: action.payload } };
    }
    case 'incidents/loaded': {
      return { ...state, incidents: action.payload };
    }
    case 'incident/loading': {
      return { ...state, loading: { ...state.loading, incident: action.payload } };
    }
    case 'incident/loaded': {
      return { ...state, selectedIncident: action.payload };
    }
    case 'incident/updated': {
      const { incident } = action.payload;
      const updatedIncidents = state.incidents.map((item) =>
        item.id === incident.id ? { ...item, ...incident } : item,
      );
      const selected =
        state.selectedIncident && state.selectedIncident.id === incident.id
          ? { ...state.selectedIncident, ...incident }
          : state.selectedIncident;
      return { ...state, incidents: updatedIncidents, selectedIncident: selected };
    }
    case 'warroom/loading': {
      return { ...state, loading: { ...state.loading, warRoom: action.payload } };
    }
    case 'warroom/loaded': {
      return {
        ...state,
        warRooms: {
          ...state.warRooms,
          [action.payload.id]: action.payload,
        },
      };
    }
    case 'warroom/messages': {
      const { id, messages } = action.payload;
      const existing = state.warRooms[id] || { id, messages: [] };
      return {
        ...state,
        warRooms: {
          ...state.warRooms,
          [id]: { ...existing, messages },
        },
      };
    }
    case 'warroom/checklist': {
      const { id, checklist } = action.payload;
      const existing = state.warRooms[id] || { id };
      return {
        ...state,
        warRooms: {
          ...state.warRooms,
          [id]: { ...existing, checklist },
        },
      };
    }
    case 'auth/loading': {
      return {
        ...state,
        auth: {
          ...state.auth,
          loading: action.payload,
          error: action.payload ? null : state.auth.error,
        },
      };
    }
    case 'auth/error': {
      return {
        ...state,
        auth: {
          ...state.auth,
          loading: false,
          error: action.payload,
        },
      };
    }
    case 'auth/success': {
      return {
        ...state,
        auth: {
          user: action.payload.user,
          token: action.payload.token ?? state.auth.token,
          loading: false,
          error: null,
          mfaRequired: false,
          mfaTicket: null,
        },
      };
    }
    case 'auth/mfa': {
      return {
        ...state,
        auth: {
          ...state.auth,
          loading: false,
          error: null,
          mfaRequired: true,
          mfaTicket: action.payload.ticket,
        },
      };
    }
    case 'auth/logout': {
      return {
        ...state,
        auth: {
          user: null,
          token: null,
          loading: false,
          error: null,
          mfaRequired: false,
          mfaTicket: null,
        },
      };
    }
    case 'traffic/append': {
      const { packets, lastTimestamp } = action.payload;
      const combined = [...state.traffic.packets, ...packets];
      const trimmed = combined.slice(-state.traffic.bufferSize);
      return {
        ...state,
        traffic: {
          ...state.traffic,
          packets: trimmed,
          lastTimestamp,
        },
      };
    }
    case 'traffic/pending': {
      const pending = [...state.traffic.pendingPackets, ...action.payload.packets].slice(-state.traffic.bufferSize);
      return {
        ...state,
        traffic: {
          ...state.traffic,
          pendingPackets: pending,
        },
      };
    }
    case 'traffic/flush': {
      const combined = [...state.traffic.packets, ...state.traffic.pendingPackets];
      const trimmed = combined.slice(-state.traffic.bufferSize);
      return {
        ...state,
        traffic: {
          ...state.traffic,
          packets: trimmed,
          pendingPackets: [],
          lastTimestamp: action.payload?.lastTimestamp || state.traffic.lastTimestamp,
        },
      };
    }
    case 'traffic/select': {
      return {
        ...state,
        traffic: {
          ...state.traffic,
          selectedPacketId: action.payload.packetId,
          selectedIp: action.payload.ip || state.traffic.selectedIp,
        },
      };
    }
    case 'traffic/filters': {
      return {
        ...state,
        traffic: {
          ...state.traffic,
          filters: { ...state.traffic.filters, ...action.payload },
        },
      };
    }
    case 'traffic/mode': {
      return {
        ...state,
        traffic: {
          ...state.traffic,
          mode: action.payload,
        },
      };
    }
    case 'traffic/polling': {
      return {
        ...state,
        traffic: {
          ...state.traffic,
          pollingInterval: action.payload,
        },
      };
    }
    case 'traffic/paused': {
      return {
        ...state,
        traffic: {
          ...state.traffic,
          paused: action.payload,
        },
      };
    }
    case 'traffic/link': {
      const { packetId, incidentId, severity } = action.payload;
      const packets = state.traffic.packets.map((packet) =>
        packet.id === packetId ? { ...packet, incidentId, severity: severity || packet.severity } : packet,
      );
      const pendingPackets = state.traffic.pendingPackets.map((packet) =>
        packet.id === packetId ? { ...packet, incidentId, severity: severity || packet.severity } : packet,
      );
      const incidents = state.incidents.map((incident) =>
        incident.id === incidentId ? { ...incident, linkedPacketId: packetId } : incident,
      );
      return {
        ...state,
        incidents,
        traffic: {
          ...state.traffic,
          packets,
          pendingPackets,
        },
      };
    }
    case 'traffic/buffer-size': {
      return {
        ...state,
        traffic: {
          ...state.traffic,
          bufferSize: action.payload,
          packets: state.traffic.packets.slice(-action.payload),
          pendingPackets: state.traffic.pendingPackets.slice(-action.payload),
        },
      };
    }
    case 'traffic/ip-filter': {
      return {
        ...state,
        traffic: {
          ...state.traffic,
          selectedIp: action.payload,
        },
      };
    }
    case 'toast/added': {
      return { ...state, toasts: [...state.toasts, action.payload] };
    }
    case 'toast/dismissed': {
      return { ...state, toasts: state.toasts.filter((item) => item.id !== action.payload) };
    }
    default:
      return state;
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState, (base) => {
    const storedSettings = loadStoredSettings();
    const storedAuth = loadStoredAuth();
    if (storedAuth.token) {
      setAuthToken(storedAuth.token);
    }
    return {
      ...base,
      settings: storedSettings,
      auth: {
        ...base.auth,
        token: storedAuth.token,
        user: storedAuth.user,
      },
    };
  });

  const cacheRef = useRef({
    incidentDetails: new Map(),
    warRooms: new Map(),
  });

  useEffect(() => {
    dispatch({ type: 'settings/loaded', payload: loadStoredSettings() });
  }, []);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const { theme } = state.settings;
    const root = document.documentElement;
    root.dataset.theme = theme;
  }, [state.settings.theme]);

  useEffect(() => {
    setAuthToken(state.auth.token);
  }, [state.auth.token]);

  const actions = useMemo(() => {
    const dismissToast = (id) => {
      dispatch({ type: 'toast/dismissed', payload: id });
    };

    const addToast = ({ title, description, tone = 'info' }) => {
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      dispatch({ type: 'toast/added', payload: { id, title, description, tone } });
      window.setTimeout(() => dismissToast(id), 4000);
    };

    const handleAuthSuccess = (token, user, toastOptions) => {
      const payload = { token, user };
      persistAuthState(payload);
      setAuthToken(token);
      dispatch({ type: 'auth/success', payload });
      if (toastOptions) {
        addToast(toastOptions);
      }
      return payload;
    };

    const loadIncidents = async (filters = {}) => {
      dispatch({ type: 'incidents/loading', payload: true });
      try {
        const incidents = await getIncidents(filters, state.settings.apiBaseUrl);
        dispatch({ type: 'incidents/loaded', payload: incidents });
        incidents.forEach((incident) => {
          cacheRef.current.incidentDetails.set(incident.id, incident);
        });
        return incidents;
      } catch (error) {
        addToast({
          title: 'Error al conectar con incidentes',
          description: error.message || 'Intenta nuevamente más tarde.',
          tone: 'danger',
        });
        if (!USE_MOCKS) {
          try {
            const fallback = await getIncidents(filters, '');
            dispatch({ type: 'incidents/loaded', payload: fallback });
            return fallback;
          } catch (fallbackError) {
            console.warn('Fallback incidents failed', fallbackError);
          }
        }
        return [];
      } finally {
        dispatch({ type: 'incidents/loading', payload: false });
      }
    };

    const loadIncidentById = async (id) => {
      dispatch({ type: 'incident/loading', payload: true });
      try {
        if (cacheRef.current.incidentDetails.has(id)) {
          const cached = cacheRef.current.incidentDetails.get(id);
          dispatch({ type: 'incident/loaded', payload: cached });
          return cached;
        }
        const incident = await getIncidentById(id, state.settings.apiBaseUrl);
        cacheRef.current.incidentDetails.set(id, incident);
        dispatch({ type: 'incident/loaded', payload: incident });
        return incident;
      } catch (error) {
        addToast({
          title: 'No se pudo cargar el incidente',
          description: error.message || 'Revisa la conexión al backend.',
          tone: 'danger',
        });
        if (!USE_MOCKS) {
          try {
            const fallback = await getIncidentById(id, '');
            cacheRef.current.incidentDetails.set(id, fallback);
            dispatch({ type: 'incident/loaded', payload: fallback });
            return fallback;
          } catch (fallbackError) {
            console.warn('Fallback incident detail failed', fallbackError);
          }
        }
        return null;
      } finally {
        dispatch({ type: 'incident/loading', payload: false });
      }
    };

    const updateIncidentStatus = async (id, actionKey) => {
      try {
        const incident = await postIncidentAction(id, { action: actionKey }, state.settings.apiBaseUrl);
        cacheRef.current.incidentDetails.set(id, incident);
        dispatch({ type: 'incident/updated', payload: { incident } });
        addToast({
          title: 'Estado actualizado',
          description: `El incidente ${id} ha sido actualizado.`,
          tone: 'success',
        });
        return incident;
      } catch (error) {
        addToast({
          title: 'No se pudo actualizar',
          description: error.message || 'Intenta nuevamente.',
          tone: 'danger',
        });
        if (!USE_MOCKS) {
          try {
            const fallback = await postIncidentAction(id, { action: actionKey }, '');
            cacheRef.current.incidentDetails.set(id, fallback);
            dispatch({ type: 'incident/updated', payload: { incident: fallback } });
            return fallback;
          } catch (fallbackError) {
            console.warn('Fallback incident action failed', fallbackError);
          }
        }
        throw error;
      }
    };

    const openWarRoom = async (id) => {
      dispatch({ type: 'warroom/loading', payload: true });
      try {
        let existing = cacheRef.current.warRooms.get(id);
        if (!existing) {
          for (const value of cacheRef.current.warRooms.values()) {
            if (value.incidentId === id) {
              existing = value;
              break;
            }
          }
        }
        if (existing) {
          dispatch({ type: 'warroom/loaded', payload: existing });
          return existing;
        }
        const response = await postIncidentWarRoom(id, state.settings.apiBaseUrl);
        // Normalizar respuesta del backend (warRoomId -> id)
        const warRoom = {
          id: response.warRoomId || response.id,
          warRoomId: response.warRoomId || response.id,
          incidentId: id,
          ...response
        };
        cacheRef.current.warRooms.set(warRoom.id, warRoom);
        dispatch({ type: 'warroom/loaded', payload: warRoom });
        return warRoom;
      } catch (error) {
        addToast({
          title: 'No se pudo abrir la mesa de trabajo',
          description: error.message || 'Intenta más tarde.',
          tone: 'danger',
        });
        if (!USE_MOCKS) {
          try {
            const fallbackResponse = await postIncidentWarRoom(id, '');
            const fallback = {
              id: fallbackResponse.warRoomId || fallbackResponse.id,
              warRoomId: fallbackResponse.warRoomId || fallbackResponse.id,
              incidentId: id,
              ...fallbackResponse
            };
            cacheRef.current.warRooms.set(fallback.id, fallback);
            dispatch({ type: 'warroom/loaded', payload: fallback });
            return fallback;
          } catch (fallbackError) {
            console.warn('Fallback war room failed', fallbackError);
          }
        }
        throw error;
      } finally {
        dispatch({ type: 'warroom/loading', payload: false });
      }
    };

    const loadWarRoomMessages = async (warRoomId) => {
      try {
        const messages = await getWarRoomMessages(warRoomId, state.settings.apiBaseUrl);
        dispatch({ type: 'warroom/messages', payload: { id: warRoomId, messages } });
        const cached = cacheRef.current.warRooms.get(warRoomId) || { id: warRoomId };
        cacheRef.current.warRooms.set(warRoomId, { ...cached, messages });
        return messages;
      } catch (error) {
        addToast({
          title: 'No se pudieron actualizar los mensajes',
          description: error.message || 'Revisa la API.',
          tone: 'warn',
        });
        if (!USE_MOCKS) {
          try {
            const fallback = await getWarRoomMessages(warRoomId, '');
            dispatch({ type: 'warroom/messages', payload: { id: warRoomId, messages: fallback } });
            return fallback;
          } catch (fallbackError) {
            console.warn('Fallback war room messages failed', fallbackError);
          }
        }
        return [];
      }
    };

    const sendWarRoomMessage = async (warRoomId, content) => {
      try {
        const { userMessage, assistantMessage } = await apiPostWarRoomMessage(
          warRoomId,
          { role: 'user', content },
          state.settings.apiBaseUrl,
        );
        const existing = cacheRef.current.warRooms.get(warRoomId) || { id: warRoomId, messages: [] };
        const updatedMessages = [...(existing.messages || []), userMessage];
        if (assistantMessage) {
          updatedMessages.push(assistantMessage);
        }
        cacheRef.current.warRooms.set(warRoomId, { ...existing, messages: updatedMessages });
        dispatch({ type: 'warroom/messages', payload: { id: warRoomId, messages: updatedMessages } });
        return updatedMessages;
      } catch (error) {
        addToast({
          title: 'No se pudo enviar el mensaje',
          description: error.message || 'Intenta nuevamente.',
          tone: 'danger',
        });
        if (!USE_MOCKS) {
          try {
            const fallback = await apiPostWarRoomMessage(
              warRoomId,
              { role: 'user', content },
              '',
            );
            const existing = cacheRef.current.warRooms.get(warRoomId) || { id: warRoomId, messages: [] };
            const updatedMessages = [...(existing.messages || []), fallback.userMessage];
            if (fallback.assistantMessage) {
              updatedMessages.push(fallback.assistantMessage);
            }
            cacheRef.current.warRooms.set(warRoomId, { ...existing, messages: updatedMessages });
            dispatch({ type: 'warroom/messages', payload: { id: warRoomId, messages: updatedMessages } });
            return updatedMessages;
          } catch (fallbackError) {
            console.warn('Fallback war room send failed', fallbackError);
          }
        }
        throw error;
      }
    };

    const updateWarRoomChecklist = (warRoomId, checklist) => {
      const existing = cacheRef.current.warRooms.get(warRoomId) || { id: warRoomId };
      const updated = { ...existing, checklist };
      cacheRef.current.warRooms.set(warRoomId, updated);
      dispatch({ type: 'warroom/checklist', payload: { id: warRoomId, checklist } });
    };

    const saveSettings = (updates) => {
      const next = {
        ...state.settings,
        ...updates,
        apiBaseUrl: normalizeBaseUrl(updates.apiBaseUrl) || DEFAULT_API_BASE_URL,
      };
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      }
      dispatch({ type: 'settings/saved', payload: next });
      addToast({
        title: 'Preferencias guardadas',
        description: 'Los cambios de configuración se aplicaron correctamente.',
        tone: 'success',
      });
      return next;
    };

    const authStartGoogleAction = async () => {
      dispatch({ type: 'auth/loading', payload: true });
      try {
        const outcome = await authStartGoogleApi(state.settings.apiBaseUrl);
        dispatch({ type: 'auth/loading', payload: false });

        // If the API returned a token (client-side flow against backend_IDS), finish login here
        if (outcome && (outcome.token || outcome.access_token)) {
          const token = outcome.token || outcome.access_token;

          // Make subsequent requests authorized
          try {
            setAuthToken(token);
          } catch (e) {
            // ignore if setAuthToken not available
          }

          // Try to obtain user info from the response or fetch /api/auth/me
          let user = outcome.user ?? null;
          if (!user) {
            try {
              user = await authFetchMeApi(state.settings.apiBaseUrl);
            } catch (e) {
              // ignore; we'll still store minimal info if available
              user = outcome.user ?? { email: outcome.email, role: outcome.role };
            }
          }

          handleAuthSuccess(token, user, {
            title: 'Sesión iniciada',
            description: `Bienvenido, ${user?.name || user?.email || ''}`,
            tone: 'success',
          });

          return { initiated: true };
        }

        return { initiated: true };
      } catch (error) {
        dispatch({ type: 'auth/error', payload: error.message });
        addToast({
          title: 'No se pudo iniciar sesión',
          description: error.message || 'Intenta nuevamente.',
          tone: 'danger',
        });
        throw error;
      }
    };

    const authHandleReturnAction = async () => {
      dispatch({ type: 'auth/loading', payload: true });
      try {
        // For Backend_IDS we use a client-side flow: the frontend obtains an id_token
        // and posts it to POST /api/auth/google. That call returns our backend JWT which
        // we store locally. Here we simply validate an existing stored token by calling
        // GET /api/auth/me. The legacy session polling endpoint (/auth/session/status)
        // belongs to the other backend and is not used when working with Backend_IDS.

        if (state.auth.token) {
          try {
            const currentUser = await authFetchMeApi(state.settings.apiBaseUrl);
            if (currentUser) {
              return handleAuthSuccess(state.auth.token, currentUser, null);
            }
          } catch (verifyError) {
            console.warn('No se pudo validar el token almacenado', verifyError);
          }
        }

        clearAuthState();
        setAuthToken(null);
        dispatch({ type: 'auth/logout' });
        return null;
      } catch (error) {
        dispatch({ type: 'auth/error', payload: error.message });
        addToast({
          title: 'No se pudo validar la sesión',
          description: error.message || 'Intenta iniciar nuevamente.',
          tone: 'danger',
        });
        return null;
      }
    };

    const authVerifyTotp = async (ticket, code) => {
      dispatch({ type: 'auth/loading', payload: true });
      try {
        const result = await authVerifyTotpApi(ticket, code, state.settings.apiBaseUrl);
        if (result?.access_token && result?.user) {
          const payload = handleAuthSuccess(result.access_token, result.user, {
            title: 'TOTP verificado',
            description: 'Autenticación en dos pasos completada.',
            tone: 'success',
          });
          return payload;
        }
        throw new Error('Respuesta inválida del servicio de autenticación.');
      } catch (error) {
        dispatch({ type: 'auth/error', payload: error.message });
        addToast({
          title: 'Código inválido',
          description: error.message || 'Revisa el código e intenta nuevamente.',
          tone: 'danger',
        });
        throw error;
      }
    };

    const authLogout = async () => {
      dispatch({ type: 'auth/loading', payload: true });
      try {
        await authLogoutApi(state.settings.apiBaseUrl);
      } catch (error) {
        console.warn('Fallo al cerrar sesión en backend. Se limpiará el estado local.', error);
      } finally {
        clearAuthState();
        setAuthToken(null);
        dispatch({ type: 'auth/logout' });
        addToast({
          title: 'Sesión cerrada',
          description: 'Has cerrado sesión correctamente.',
          tone: 'info',
        });
        // Redirigir al login después de cerrar sesión
        if (typeof window !== 'undefined') {
          window.setTimeout(() => {
            window.location.hash = '#/login';
          }, 100);
        }
      }
    };

    const appendTrafficBatch = (packets) => {
      if (!Array.isArray(packets) || !packets.length) return;
      const lastTimestamp = packets.reduce((max, packet) => {
        const ts = new Date(packet.timestamp).getTime();
        return ts > max ? ts : max;
      }, state.traffic.lastTimestamp || 0);
      if (state.traffic.paused) {
        dispatch({ type: 'traffic/pending', payload: { packets } });
      } else {
        dispatch({ type: 'traffic/append', payload: { packets, lastTimestamp } });
      }
    };

    const flushTrafficQueue = () => {
      dispatch({ type: 'traffic/flush', payload: { lastTimestamp: Date.now() } });
    };

    const selectTrafficPacket = (packetId, ip) => {
      dispatch({ type: 'traffic/select', payload: { packetId, ip } });
      if (ip) {
        dispatch({ type: 'traffic/ip-filter', payload: ip });
      }
    };

    const setTrafficFilters = (filters) => {
      dispatch({ type: 'traffic/filters', payload: filters });
    };

    const setTrafficMode = (mode) => {
      dispatch({ type: 'traffic/mode', payload: mode });
    };

    const setTrafficPollingInterval = (interval) => {
      dispatch({ type: 'traffic/polling', payload: interval });
    };

    const setTrafficPaused = (paused) => {
      dispatch({ type: 'traffic/paused', payload: paused });
      if (!paused && state.traffic.pendingPackets.length) {
        flushTrafficQueue();
      }
    };

    const setTrafficBufferSize = (size) => {
      dispatch({ type: 'traffic/buffer-size', payload: size });
    };

    const setTrafficIpFilter = (ip) => {
      dispatch({ type: 'traffic/ip-filter', payload: ip });
    };

    const linkPacketToIncident = (packetId, incidentId, severity) => {
      if (incidentId && cacheRef.current.incidentDetails.has(incidentId)) {
        const cached = cacheRef.current.incidentDetails.get(incidentId);
        cacheRef.current.incidentDetails.set(incidentId, { ...cached, linkedPacketId: packetId });
      }
      dispatch({ type: 'traffic/link', payload: { packetId, incidentId, severity } });
    };

    const loadPacketDetail = async (packetId) => {
      try {
        const detail = await getTrafficPacketById(packetId, state.settings.apiBaseUrl);
        return detail;
      } catch (error) {
        addToast({
          title: 'No se pudo obtener el detalle del paquete',
          description: error.message || 'Intenta nuevamente.',
          tone: 'danger',
        });
        if (!USE_MOCKS) {
          try {
            return await getTrafficPacketById(packetId, '');
          } catch (fallbackError) {
            console.warn('Fallback packet detail failed', fallbackError);
          }
        }
        throw error;
      }
    };

    const requestRecentTraffic = async ({ since, limit }) => {
      try {
        const packets = await getTrafficRecent({ since, limit }, state.settings.apiBaseUrl);
        return packets;
      } catch (error) {
        addToast({
          title: 'No se pudo actualizar el tráfico',
          description: error.message || 'Revisa la conexión al backend.',
          tone: 'warn',
        });
        if (!USE_MOCKS) {
          try {
            return await getTrafficRecent({ since, limit }, '');
          } catch (fallbackError) {
            console.warn('Fallback traffic recent failed', fallbackError);
          }
        }
        throw error;
      }
    };

    const createIncidentFromPacketAction = async ({ packetId, reason, severity }) => {
      try {
        const result = await postIncidentFromPacket(packetId, reason, severity, state.settings.apiBaseUrl);
        linkPacketToIncident(packetId, result.incidentId, severity);
        addToast({
          title: 'Incidente generado',
          description: `Se creó el incidente ${result.incidentId} a partir del paquete seleccionado.`,
          tone: 'success',
        });
        return result;
      } catch (error) {
        addToast({
          title: 'No se pudo crear el incidente',
          description: error.message || 'Intenta nuevamente.',
          tone: 'danger',
        });
        if (!USE_MOCKS) {
          try {
            const fallback = await postIncidentFromPacket(packetId, reason, severity, '');
            linkPacketToIncident(packetId, fallback.incidentId, severity);
            return fallback;
          } catch (fallbackError) {
            console.warn('Fallback incident from packet failed', fallbackError);
          }
        }
        throw error;
      }
    };

    return {
      addToast,
      dismissToast,
      loadIncidents,
      loadIncidentById,
      updateIncidentStatus,
      openWarRoom,
      loadWarRoomMessages,
      sendWarRoomMessage,
      updateWarRoomChecklist,
      saveSettings,
      authStartGoogle: authStartGoogleAction,
      authHandleReturn: authHandleReturnAction,
      authVerifyTotp,
      authLogout,
      appendTrafficBatch,
      flushTrafficQueue,
      selectTrafficPacket,
      setTrafficFilters,
      setTrafficMode,
      setTrafficPollingInterval,
      setTrafficPaused,
      setTrafficBufferSize,
      setTrafficIpFilter,
      linkPacketToIncident,
      loadPacketDetail,
      requestRecentTraffic,
      createIncidentFromPacketAction,
    };
  }, [state.settings, state.traffic, state.incidents, state.auth]);

  return createElement(
    AppStateContext.Provider,
    { value: state },
    createElement(AppActionsContext.Provider, { value: actions }, children),
  );
}

export function useAppState() {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState debe usarse dentro de AppProvider');
  }
  return context;
}

export function useAppActions() {
  const context = useContext(AppActionsContext);
  if (!context) {
    throw new Error('useAppActions debe usarse dentro de AppProvider');
  }
  return context;
}
