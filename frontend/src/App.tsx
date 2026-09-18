import { lazy, Suspense } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { Loading } from './components/Loading';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { ProjectDetailPage } from './pages/ProjectDetailPage';
import { SiteDetailPage } from './pages/SiteDetailPage';
import { LoginPage } from './pages/LoginPage';

// The map page is the only route that pulls in mapbox-gl (~1.5MB), so it is loaded
// on demand rather than blocking the dashboard's first paint.
const MapPage = lazy(() => import('./pages/MapPage').then((m) => ({ default: m.MapPage })));

// Stale-while-revalidate defaults: dashboard numbers change rarely, and refetching
// on window focus gives the demo a live feel without a websocket layer.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/projects" element={<ProjectsPage />} />
                <Route path="/projects/:projectId" element={<ProjectDetailPage />} />
                <Route path="/sites/:siteId" element={<SiteDetailPage />} />
                <Route
                  path="/map"
                  element={
                    <Suspense fallback={<Loading label="Loading map…" />}>
                      <MapPage />
                    </Suspense>
                  }
                />
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
