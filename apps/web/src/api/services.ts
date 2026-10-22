import { api } from './client';
import type { Service } from './types';

export type ServiceInput = Omit<Service, 'id'>;

export const servicesApi = {
  listActive: () => api<{ services: Service[] }>('/services').then((r) => r.services),
  listAll: () => api<{ services: Service[] }>('/services/all').then((r) => r.services),
  create: (body: ServiceInput) =>
    api<{ service: Service }>('/services', 'POST', body).then((r) => r.service),
  update: (id: string, body: Partial<ServiceInput>) =>
    api<{ service: Service }>(`/services/${id}`, 'PATCH', body).then((r) => r.service),
};
