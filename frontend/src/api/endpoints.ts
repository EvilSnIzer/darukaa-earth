/** All backend calls in one place, so components never build URLs themselves. */

import { api } from './client';
import type {
  DashboardSummary,
  SiteGeometry,
  Paginated,
  Project,
  ProjectAnalytics,
  Site,
  SiteAnalytics,
  SiteDetail,
  SiteFeatureCollection,
  TokenResponse,
  User,
} from '../types';

export const authApi = {
  login: (email: string, password: string) =>
    api.public.post<TokenResponse>('/auth/login', { email, password }),

  register: (input: { email: string; full_name: string; password: string }) =>
    api.public.post<TokenResponse>('/auth/register', input),

  refresh: (refresh_token: string) =>
    api.public.post<TokenResponse>('/auth/refresh', { refresh_token }),

  me: () => api.get<User>('/auth/me'),

  logout: () => api.post<{ detail: string }>('/auth/logout'),
};

export const projectsApi = {
  list: (params?: { search?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    query.set('limit', String(params?.limit ?? 50));
    return api.get<Paginated<Project>>(`/projects?${query.toString()}`);
  },
  get: (id: string) => api.get<Project>(`/projects/${id}`),
  create: (payload: Partial<Project>) => api.post<Project>('/projects', payload),
  update: (id: string, payload: Partial<Project>) => api.patch<Project>(`/projects/${id}`, payload),
  remove: (id: string) => api.delete<{ detail: string }>(`/projects/${id}`),
  sitesGeoJSON: (id: string) => api.get<SiteFeatureCollection>(`/projects/${id}/sites/geojson`),
};

export const sitesApi = {
  list: (projectId?: string) =>
    api.get<Site[]>(projectId ? `/sites?project_id=${projectId}` : '/sites'),
  get: (id: string) => api.get<SiteDetail>(`/sites/${id}`),
  mapGeoJSON: (projectId?: string) =>
    api.get<SiteFeatureCollection>(
      projectId ? `/sites/map/geojson?project_id=${projectId}` : '/sites/map/geojson',
    ),
  create: (payload: {
    name: string;
    description?: string;
    land_cover?: string;
    planting_year?: number;
    project_id: string;
    geometry: SiteGeometry;
  }) => api.post<SiteDetail>('/sites', payload),
  update: (id: string, payload: Record<string, unknown>) =>
    api.patch<SiteDetail>(`/sites/${id}`, payload),
  remove: (id: string) => api.delete<{ detail: string }>(`/sites/${id}`),
};

export const analyticsApi = {
  dashboard: () => api.get<DashboardSummary>('/analytics/dashboard'),
  project: (id: string) => api.get<ProjectAnalytics>(`/analytics/projects/${id}`),
  site: (id: string) => api.get<SiteAnalytics>(`/analytics/sites/${id}`),
};
