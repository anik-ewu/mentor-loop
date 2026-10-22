import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { homeFor, useAuth } from '../auth/AuthContext';
import { ButtonLink } from '../components/Button';
import { Logo, ThemeToggle } from '../components/ui';
import s from './PublicLayout.module.css';

export function PublicLayout() {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const { pathname, hash } = useLocation();

  // Scroll to #section links (react-router does not do this on its own).
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    else window.scrollTo(0, 0);
  }, [pathname, hash]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <header className={`${s.header} ${scrolled ? s.scrolled : ''}`}>
        <div className={`container ${s.inner}`}>
          <Logo />
          <nav className={s.nav} aria-label="Main">
            <Link to="/#services">Services</Link>
            <Link to="/#how">How it works</Link>
            <Link to="/#faq">FAQ</Link>
          </nav>
          <div className={s.actions}>
            <ThemeToggle />
            {user ? (
              <ButtonLink to={homeFor(user)} variant="primary" size="sm">
                Dashboard
              </ButtonLink>
            ) : (
              <>
                <ButtonLink to="/login" variant="ghost" size="sm" className={s.hideSm}>
                  Log in
                </ButtonLink>
                <ButtonLink to="/signup" variant="primary" size="sm">
                  Get started
                </ButtonLink>
              </>
            )}
          </div>
        </div>
      </header>
      <main>
        <Outlet />
      </main>
      <footer className={s.footer}>
        <div className={`container ${s.inner}`}>
          <span>© {new Date().getFullYear()} MentorLoop. Built with care in Dhaka.</span>
          <span>React · Node.js · PostgreSQL · Docker</span>
        </div>
      </footer>
    </>
  );
}
