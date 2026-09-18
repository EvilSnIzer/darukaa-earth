import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function Layout() {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">D</div>
          <div>
            <div className="brand-name">Darukaa.Earth</div>
            <div className="brand-sub">MRV Analytics</div>
          </div>
        </div>

        <nav>
          <NavLink to="/" end className="nav-link">
            <span>📊</span> Dashboard
          </NavLink>
          <NavLink to="/projects" className="nav-link">
            <span>🗂️</span> Projects
          </NavLink>
          <NavLink to="/map" className="nav-link">
            <span>🗺️</span> Site Map
          </NavLink>
        </nav>

        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">{user ? initials(user.full_name) : '?'}</div>
            <div>
              <div style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{user?.full_name}</div>
              <div style={{ color: '#8fc3ab', fontSize: 11.5 }}>
                {isAdmin ? 'Administrator' : 'Viewer'}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-secondary btn-sm btn-block"
            style={{ marginTop: 6 }}
          >
            Sign out
          </button>
        </div>
      </aside>

      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <header className="topbar">
      <div className="topbar-title">
        <h1>{title}</h1>
        {subtitle ? <span className="muted small">{subtitle}</span> : null}
      </div>
      {actions ? <div className="row">{actions}</div> : null}
    </header>
  );
}
