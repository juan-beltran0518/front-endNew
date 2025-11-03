import { memo } from 'react';

const navItems = [
  { key: 'dashboard', label: 'Dashboard', description: 'Resumen de incidentes', adminOnly: false },
  { key: 'settings', label: 'Configuración', description: 'Preferencias del sistema', adminOnly: true },
];

// Helper to check if user has admin role
function isAdmin(user) {
  if (!user) return false;
  const role = user.role;
  const authorities = user.authorities;
  
  if (typeof role === 'string' && (role === 'ROLE_ADMIN' || role === 'ADMIN' || role === 'admin')) {
    return true;
  }
  
  if (Array.isArray(authorities)) {
    return authorities.some(auth => {
      const authStr = typeof auth === 'string' ? auth : auth?.authority || '';
      return authStr === 'ROLE_ADMIN' || authStr === 'ADMIN';
    });
  }
  
  return false;
}

const Sidebar = memo(function Sidebar({ collapsed, onToggle, activeKey, onNavigate, user }) {
  const userIsAdmin = isAdmin(user);
  const visibleItems = navItems.filter(item => !item.adminOnly || userIsAdmin);
  
  return (
    <aside className={`sidebar ${collapsed ? 'is-collapsed' : ''}`} aria-label="Navegación principal">
      <div className="sidebar-header">
        <button
          type="button"
          className="sidebar-toggle"
          onClick={onToggle}
          aria-pressed={collapsed}
          aria-label={collapsed ? 'Expandir navegación' : 'Colapsar navegación'}
        >
          ☰
        </button>
        {!collapsed && <span className="sidebar-brand">IDS Campus</span>}
      </div>
      <nav className="sidebar-nav">
        <ul>
          {visibleItems.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className={activeKey === item.key ? 'active' : ''}
                onClick={() => onNavigate?.(item.key)}
                aria-current={activeKey === item.key ? 'page' : undefined}
              >
                <span className="nav-label">{item.label}</span>
                {!collapsed && <span className="nav-description">{item.description}</span>}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
});

export default Sidebar;
