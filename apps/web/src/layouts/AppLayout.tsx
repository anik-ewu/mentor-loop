import { useEffect, type ComponentType, type SVGProps } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { Button } from '../components/Button';
import {
  BriefcaseIcon,
  CalendarIcon,
  GridIcon,
  HomeIcon,
  LayersIcon,
  ListIcon,
  LogoutIcon,
  SparkIcon,
} from '../components/icons';
import { Avatar, Logo, ThemeToggle } from '../components/ui';
import { useToast } from '../components/Toast';
import s from './AppLayout.module.css';

interface NavItem {
  to: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  end?: boolean;
}

const USER_NAV: NavItem[] = [
  { to: '/app', label: 'Home', icon: HomeIcon, end: true },
  { to: '/app/jobs', label: 'Jobs', icon: BriefcaseIcon },
  { to: '/app/ai', label: 'AI Coach', icon: SparkIcon },
  { to: '/app/sessions', label: 'Sessions', icon: CalendarIcon },
];

const ADMIN_NAV: NavItem[] = [
  { to: '/admin', label: 'Overview', icon: GridIcon, end: true },
  { to: '/admin/bookings', label: 'Bookings', icon: ListIcon },
  { to: '/admin/slots', label: 'Availability', icon: CalendarIcon },
  { to: '/admin/services', label: 'Services', icon: LayersIcon },
  { to: '/admin/usage', label: 'AI usage', icon: SparkIcon },
];

const linkClass =
  (base: string) =>
  ({ isActive }: { isActive: boolean }) =>
    `${base} ${isActive ? s.active : ''}`;

export function AppLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const nav = user?.role === 'admin' ? ADMIN_NAV : USER_NAV;
  const home = nav[0]!.to;

  // Lets toasts sit above the mobile tab bar.
  useEffect(() => {
    document.body.classList.add('has-tabbar');
    return () => document.body.classList.remove('has-tabbar');
  }, []);

  const onLogout = async () => {
    await logout();
    toast('You are logged out. See you soon!');
    navigate('/');
  };

  return (
    <div className={s.shell}>
      <aside className={s.sidebar}>
        <Logo to={home} />
        <nav className={s.sideNav} aria-label="App">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkClass(s.sideLink)}>
              <Icon /> {label}
            </NavLink>
          ))}
        </nav>
        <div className={s.sideFooter}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="subtle">Theme</span>
            <ThemeToggle />
          </div>
          {user && (
            <div className={s.userCard}>
              <Avatar name={user.name} src={user.avatarUrl} />
              <div>
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
            </div>
          )}
          <Button variant="ghost" onClick={onLogout} block>
            <LogoutIcon /> Log out
          </Button>
        </div>
      </aside>

      <div>
        <header className={s.topbar}>
          <Logo to={home} />
          <div className="row" style={{ gap: 8 }}>
            <ThemeToggle />
            <button className={s.iconBtn} onClick={onLogout} aria-label="Log out">
              <LogoutIcon />
            </button>
          </div>
        </header>
        <main className={s.content}>
          <Outlet />
        </main>
      </div>

      <nav className={s.tabbar} aria-label="App">
        {nav.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} className={linkClass(s.tab)}>
            <Icon /> {label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
