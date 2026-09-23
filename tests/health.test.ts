import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('health', () => {
  it('GET /api/v1/health returns envelope', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.statusCode).toBe(200);
  });

  it('unknown route returns error envelope', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.statusCode).toBe(404);
  });
});
