/**
 * Minimal OpenAPI document for /api/docs.
 * Full generation from Zod can replace this later.
 */
export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'CookconneKt API',
    version: '1.0.0',
    description: 'REST API for the public site and admin dashboard',
  },
  servers: [{ url: '/api/v1' }],
  paths: {
    '/health': {
      get: {
        summary: 'Liveness',
        responses: { '200': { description: 'OK' } },
      },
    },
    '/auth/login': {
      post: {
        summary: 'Login',
        responses: {
          '200': { description: 'Access token issued' },
          '401': { description: 'Invalid credentials' },
          '423': { description: 'Account locked' },
        },
      },
    },
    '/jobs': {
      get: { summary: 'Search offers' },
      post: { summary: 'Create offer (employer, pending approval)' },
    },
    '/candidates': {
      get: { summary: 'Search cooks' },
    },
    '/admin/dashboard/stats': {
      get: { summary: 'Admin KPI cards' },
    },
  },
};
