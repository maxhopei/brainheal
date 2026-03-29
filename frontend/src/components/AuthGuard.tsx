import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

/**
 * Layout route that protects child routes from unauthenticated access.
 * Redirects unauthenticated users to /login.
 * Used as a React Router layout route: <Route element={<AuthGuard />}>.
 */
export function AuthGuard() {
  const { user, loading } = useAuth();

  if (loading) {
    // Still resolving initial session — render nothing (App.tsx already shows a spinner)
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // User is authenticated — render child routes
  return <Outlet />;
}
