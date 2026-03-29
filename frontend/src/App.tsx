import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthGuard } from '@/components/AuthGuard';
import { BottomNav } from '@/components/BottomNav';
import { LoginPage } from '@/pages/LoginPage';
import { FeedPage } from '@/pages/FeedPage';
import { AddContentPage } from '@/pages/AddContentPage';
import { ShareTargetPage } from '@/pages/ShareTargetPage';
import { QueuePage } from '@/pages/QueuePage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import styles from './App.module.css';

/**
 * Root application component.
 * Sets up React Router with authentication-protected routes and bottom navigation.
 */
export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public route */}
        <Route path="/login" element={<LoginPage />} />

        {/* Protected routes — AuthGuard as layout route (uses Outlet internally) */}
        <Route element={<AuthGuard />}>
          <Route element={<AppShell />}>
            <Route path="/" element={<FeedPage />} />
            <Route path="/add" element={<AddContentPage />} />
            <Route path="/share" element={<ShareTargetPage />} />
            <Route path="/queue" element={<QueuePage />} />
            <Route path="/favorites" element={<FavoritesPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

/**
 * Authenticated app shell: renders the scrollable main content area
 * plus the persistent bottom navigation bar.
 */
function AppShell() {
  return (
    <div className={styles['app-shell']}>
      <main className={styles['main-content']}>
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}
