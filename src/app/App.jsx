import { useMemo, useState } from 'react';
import { useAppActions, useAppState } from './state.js';
import { getRouteHash, navigate, requireAuth, useRoute } from './router.js';
import Sidebar from '../components/Sidebar.jsx';
import Topbar from '../components/Topbar.jsx';
import Toast from '../components/Toast.jsx';
import Loader from '../components/Loader.jsx';
import EmptyState from '../components/EmptyState.jsx';
import './App.css';

const pageMeta = {
  dashboard: {
    title: 'Dashboard',
    subtitle: 'Resumen en tiempo real del IDS universitario.',
  },
  incident: {
    title: 'Detalle de incidente',
    subtitle: 'Analiza las evidencias y acciones sugeridas.',
  },
  'war-room': {
    title: 'Mesa de trabajo',
    subtitle: 'Coordina la respuesta junto con la IA.',
  },
  settings: {
    title: 'Configuración',
    subtitle: 'Ajusta umbrales y preferencias del sistema.',
  },
};

const themeOrder = ['auto', 'light', 'dark'];

function App() {
  const route = useRoute();
  const { toasts, settings, auth } = useAppState();
  const { dismissToast, saveSettings, authLogout } = useAppActions();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const meta = pageMeta[route.key] || pageMeta.dashboard;
  const isAuthRoute = route.key === 'login';

  const content = useMemo(() => {
    if (route.error) {
      return (
        <EmptyState
          title="No se pudo cargar la vista"
          description="Intenta navegar nuevamente o recarga la página."
          action={
            <button type="button" className="btn primary" onClick={() => navigate(getRouteHash('dashboard'))}>
              Ir al dashboard
            </button>
          }
        />
      );
    }

    if (!route.Component) {
      return <Loader label="Cargando módulo" />;
    }

    const Page = route.Component;
    const renderPage = () => <Page params={route.params} />;
    return route.private ? requireAuth(renderPage, route.adminOnly) : renderPage();
  }, [route]);

  const handleThemeCycle = () => {
    const currentIndex = themeOrder.indexOf(settings.theme);
    const next = themeOrder[(currentIndex + 1) % themeOrder.length];
    saveSettings({ ...settings, theme: next });
  };

  const handleNavigate = (key) => {
    navigate(getRouteHash(key));
  };

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? 'is-nav-collapsed' : ''} ${
        isAuthRoute ? 'is-auth-view' : ''
      }`}
    >
      {!isAuthRoute && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed((value) => !value)}
          activeKey={route.key}
          onNavigate={handleNavigate}
          user={auth.user}
        />
      )}
      <div className="app-workspace">
        {!isAuthRoute && (
          <Topbar
            title={meta.title}
            subtitle={meta.subtitle}
            theme={settings.theme}
            onThemeCycle={handleThemeCycle}
            onMenuToggle={() => setSidebarCollapsed((value) => !value)}
            user={auth.user}
            onLogout={authLogout}
            authLoading={auth.loading}
          />
        )}
        <main className={`app-main ${isAuthRoute ? 'auth-main' : ''}`} role="main">
          {content}
        </main>
      </div>
      <div className="toast-region" aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => (
          <Toast key={toast.id} {...toast} onDismiss={dismissToast} />
        ))}
      </div>
    </div>
  );
}

export default App;
