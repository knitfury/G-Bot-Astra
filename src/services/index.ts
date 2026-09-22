// Composition root: replace these adapters with desktop/cloud implementations in Phase 2.
import type { Services } from './contracts';
import { mockServices } from './mocks';
export const services: Services = mockServices;
