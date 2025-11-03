# IDS Campus Frontend (2025)

Interfaz React minimalista para el IDS universitario. La UI trabaja únicamente con React 19 + CSS nativo y está preparada para conectar un backend REST/WebSocket cuando esté disponible.

## Vista rápida

- **Dashboard** con métricas rápidas, monitor de tráfico (wireframe por defecto o en vivo si se activa), alertas y tabla de incidentes.
- **Detalle de incidentes**, **Mesa de trabajo** (chat polling + checklist) y **Configuración** (persistente en `localStorage`).
- **Autenticación**: flujo Google Sign-In → `auth/me` → TOTP opcional.
- **Mocks** incluidos para trabajar sin backend (`VITE_USE_MOCKS=true`).

## Estado actual del frontend

| Dominio | Implementado | Notas para backend |
|---------|--------------|--------------------|
| Auth | Botón Google → `GET /auth/google/start` (redirect); `auth/me`, `auth/mfa/verify`, `auth/logout`. | Responder con usuario o `mfa_required`. Usa cookies (`credentials: 'include'`). |
| Incidentes | Listado + detalle + acciones (`close_fp`, `escalate`, `mark_contained`). | Endpoints: `GET /incidents`, `GET /incidents/:id`, `POST /incidents/:id/actions`, `POST /incidents/:id/war-room`, `POST /incidents/from-packet`. |
| War Room | Chat polling + checklist + “marcar contenido”. | `GET /war-room/:id/messages`, `POST /war-room/:id/messages`. |
| Monitor tráfico | Wireframe por defecto. Modo live: WebSocket `traffic/stream`, fallback `GET /traffic/recent`, detalle `GET /traffic/packets/:id`, creación de incidente. | Habilitar con `VITE_MONITOR_ENABLED=true`. Mensajes: `packet_batch`, `packet`, `alert`. |
| Toasts / UI | Feedback global con `addToast` (success/warn/danger). | Responder con mensajes claros para mostrar al usuario. |
| Settings | `settings.apiBaseUrl`, `theme`, notificaciones; persistido en `localStorage`. | Actualiza esta URL para apuntar al backend real. |

## Variables de entorno (opcional `/.env.local`)

```
VITE_USE_MOCKS=true            # Usa mocks sin backend
VITE_MONITOR_ENABLED=true      # Activa monitor WS/polling
VITE_MOCK_TRAFFIC_SEED=120     # Paquetes iniciales mock
VITE_MOCK_TRAFFIC_MIN_BATCH=1
VITE_MOCK_TRAFFIC_MAX_BATCH=3
VITE_MOCK_INCIDENT_LIMIT=5
```

## Scripts

```bash
npm install
npm run dev      # Vite dev server
npm run build    # Build producción
npm run preview  # Preview build
```

## Próximos pasos sugeridos

1. Configurar `apiBaseUrl` en Configuración o `.env` y activar `VITE_MONITOR_ENABLED` cuando el backend esté listo.
2. Implementar WebSocket/REST en el backend según los contratos anteriores.
3. Sustituir la tarjeta placeholder de “Incidentes recientes” por la tabla real conectada a `GET /incidents` cuando la API esté estable.

El frontend está listo para integrarse directamente: sólo falta apuntar a tus endpoints y, si lo deseas, ajustar los mocks para tu entorno de QA.
