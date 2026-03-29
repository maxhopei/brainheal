import { NavLink } from 'react-router-dom';
import styles from './BottomNav.module.css';

type NavItem = {
  to: string;
  label: string;
  icon: string;
  ariaLabel: string;
};

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Feed', icon: '⚡', ariaLabel: 'Feed' },
  { to: '/favorites', label: 'Saved', icon: '★', ariaLabel: 'Favorites' },
  { to: '/queue', label: 'Queue', icon: '◎', ariaLabel: 'Processing Queue' },
  { to: '/settings', label: 'Settings', icon: '⚙', ariaLabel: 'Settings' },
];

/**
 * Persistent bottom navigation bar shown on all authenticated screens.
 * 4 tabs: Feed, Favorites, Queue, Settings.
 */
export function BottomNav() {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `${styles.navItem} ${isActive ? styles.navItemActive : ''}`
          }
          aria-label={item.ariaLabel}
        >
          <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
          <span className={styles.navLabel}>{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
