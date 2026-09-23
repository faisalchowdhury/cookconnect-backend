import request from 'supertest';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import * as authService from '../src/modules/auth/auth.service';
import { User } from '../src/modules/user/user.model';

const app = createApp();

const EMAIL = 'session@example.com';
const PASSWORD = 'Password1!';

beforeEach(async () => {
  await authService.register({ email: EMAIL, password: PASSWORD, role: 'candidate', locale: 'fr' });
  await User.updateOne({ email: EMAIL }, { status: 'active', emailVerified: true });
});

function login(client?: string) {
  const req = request(app).post('/api/v1/auth/login');
  if (client) req.set('X-Auth-Client', client);
  return req.send({ email: EMAIL, password: PASSWORD });
}

function cookieNamed(res: request.Response, name: string): string | undefined {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((c) => c.startsWith(`${name}=`))?.split(';')[0];
}

describe('refresh cookies per client', () => {
  it('gives the dashboard its own refresh cookie', async () => {
    const dashboard = await login('dashboard');
    expect(dashboard.status).toBe(200);
    expect(cookieNamed(dashboard, 'adminRefreshToken')).toBeDefined();
    expect(cookieNamed(dashboard, 'refreshToken')).toBeUndefined();

    const site = await login();
    expect(site.status).toBe(200);
    expect(cookieNamed(site, 'refreshToken')).toBeDefined();
    expect(cookieNamed(site, 'adminRefreshToken')).toBeUndefined();
  });

  it('refreshes only with the cookie that belongs to the calling client', async () => {
    const cookie = cookieNamed(await login('dashboard'), 'adminRefreshToken')!;

    const wrongClient = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(wrongClient.status).toBe(401);

    const ok = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .set('X-Auth-Client', 'dashboard');
    expect(ok.status).toBe(200);
    expect(ok.body.data.accessToken).toEqual(expect.any(String));
  });
});

describe('logout', () => {
  it('revokes the session without an access token', async () => {
    const cookie = cookieNamed(await login(), 'refreshToken')!;

    const out = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);

    const after = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);
    expect(after.status).toBe(401);
  });
});

describe('auth rate limit', () => {
  it('does not count successful sign-ins', async () => {
    for (let i = 0; i < env.AUTH_RATE_LIMIT_MAX + 5; i += 1) {
      const res = await login();
      expect(res.status).toBe(200);
    }
  });
});
