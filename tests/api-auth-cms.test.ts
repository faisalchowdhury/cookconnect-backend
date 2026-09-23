import request from 'supertest';
import sharp from 'sharp';
import { Types } from 'mongoose';
import { createApp } from '../src/app';
import * as email from '../src/utils/email';
import { getStorage } from '../src/utils/storage';
import { hashPassword, hashToken } from '../src/utils/crypto';
import { User } from '../src/modules/user/user.model';
import { OtpToken } from '../src/modules/auth/otp.model';
import { Session } from '../src/modules/auth/session.model';
import { CandidateProfile } from '../src/modules/candidate/candidate.model';
import { EmployerProfile } from '../src/modules/employer/employer.model';
import { Notification } from '../src/modules/notification/notification.model';
import * as notificationService from '../src/modules/notification/notification.service';
import { Feedback } from '../src/modules/feedback/feedback.model';
import { ActivityLog } from '../src/modules/activityLog/activityLog.model';
import { Banner } from '../src/modules/banner/banner.model';
import { MediaAsset } from '../src/modules/media/media.model';
import { SearchEvent } from '../src/modules/analytics/searchEvents.model';
import * as taxonomyService from '../src/modules/taxonomy/taxonomy.service';
import {
  API,
  jobBody,
  makeAdmin,
  makeCandidate,
  makeEmployer,
  makeJob,
  makeMedia,
  makeUser,
  seedTaxonomy,
  tokenFor,
} from './helpers/fixtures';

const app = createApp();
const PASSWORD = 'Password1!';

// The auth rate limiter counts failures per IP for the whole file, so each test gets its own address.
let ipSeq = 0;
let ip = '';
let mailSpy: jest.SpyInstance;

beforeEach(async () => {
  ipSeq += 1;
  ip = `10.9.${Math.floor(ipSeq / 200)}.${(ipSeq % 200) + 1}`;
  mailSpy = jest.spyOn(email, 'sendMail').mockResolvedValue(undefined);
  await seedTaxonomy();
});

afterEach(() => {
  mailSpy.mockRestore();
});

function get(path: string, token?: string) {
  const req = request(app).get(`${API}${path}`).set('X-Forwarded-For', ip);
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}

function send(method: 'post' | 'patch' | 'delete', path: string, body?: unknown, token?: string) {
  const req = request(app)[method](`${API}${path}`).set('X-Forwarded-For', ip);
  if (token) req.set('Authorization', `Bearer ${token}`);
  return body === undefined ? req : req.send(body as object);
}

function refresh(cookieHeader?: string) {
  const req = request(app).post(`${API}/auth/refresh`).set('X-Forwarded-For', ip);
  return cookieHeader ? req.set('Cookie', cookieHeader) : req;
}

function refreshCookie(res: request.Response): string | undefined {
  return ([] as string[])
    .concat(res.headers['set-cookie'] ?? [])
    .find((c) => c.startsWith('refreshToken='))
    ?.split(';')[0];
}

async function makeAccount(role: 'candidate' | 'employer' | 'admin', extra: Record<string, unknown> = {}) {
  return makeUser(role, { passwordHash: await hashPassword(PASSWORD), ...extra });
}

async function setOtpCode(address: string, purpose: 'verify-email' | 'reset-password', code = '123456') {
  await OtpToken.updateMany({ email: address, purpose, consumedAt: null }, { codeHash: hashToken(code) });
}

async function backdate(model: any, id: unknown, msAgo: number, extra: Record<string, unknown> = {}) {
  await model.collection.updateOne(
    { _id: id },
    { $set: { createdAt: new Date(Date.now() - msAgo), ...extra } },
  );
}

describe('health', () => {
  it('reports liveness and database readiness', async () => {
    const live = await get('/health');
    expect(live.status).toBe(200);
    expect(live.body.data).toEqual({ status: 'ok' });

    const ready = await get('/health/ready');
    expect(ready.status).toBe(200);
    expect(ready.body.data.status).toBe('ready');
  });
});

describe('POST /auth/register', () => {
  it('creates a pending candidate with a profile stub and emails a 6-digit code', async () => {
    const res = await send('post', '/auth/register', {
      email: 'New.Cook@Example.com',
      password: PASSWORD,
      role: 'candidate',
      phone: '0611223344',
      locale: 'ar',
    });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeNull();

    const user = await User.findOne({ email: 'new.cook@example.com' });
    expect(user.toObject()).toMatchObject({
      role: 'candidate',
      status: 'pending',
      emailVerified: false,
      phone: '0611223344',
      locale: 'ar',
    });
    expect(await CandidateProfile.exists({ userId: user._id })).toBeTruthy();
    expect(mailSpy).toHaveBeenCalledTimes(1);
    expect(mailSpy.mock.calls[0][0].to).toBe('new.cook@example.com');
    expect(mailSpy.mock.calls[0][0].text).toMatch(/\b\d{6}\b/);
  });

  it('creates an employer profile stub for employers', async () => {
    const res = await send('post', '/auth/register', {
      email: 'rh@restaurant.ma',
      password: PASSWORD,
      role: 'employer',
    });
    expect(res.status).toBe(201);

    const user = await User.findOne({ email: 'rh@restaurant.ma' });
    expect(await EmployerProfile.exists({ userId: user._id })).toBeTruthy();
  });

  it('refuses a second account for the same email in any letter case', async () => {
    const body = { email: 'cook@example.com', password: PASSWORD, role: 'candidate' };
    expect((await send('post', '/auth/register', body)).status).toBe(201);
    expect((await send('post', '/auth/register', { ...body, email: 'COOK@example.com' })).status).toBe(409);
    expect(await User.countDocuments()).toBe(1);
  });

  it.each([
    ['a weak password', { email: 'a@b.ma', password: 'password', role: 'candidate' }],
    ['the admin role', { email: 'a@b.ma', password: PASSWORD, role: 'admin' }],
    ['a malformed email', { email: 'not-an-email', password: PASSWORD, role: 'candidate' }],
    ['an unknown locale', { email: 'a@b.ma', password: PASSWORD, role: 'candidate', locale: 'de' }],
    ['a missing role', { email: 'a@b.ma', password: PASSWORD }],
  ])('rejects %s with 422 and creates nothing', async (_label, body) => {
    expect((await send('post', '/auth/register', body)).status).toBe(422);
    expect(await User.countDocuments()).toBe(0);
  });
});

describe('POST /auth/verify-otp', () => {
  async function registered(address = 'verify@example.com') {
    await send('post', '/auth/register', { email: address, password: PASSWORD, role: 'candidate' });
    await setOtpCode(address, 'verify-email');
    return address;
  }

  it('activates the account and consumes the code', async () => {
    const address = await registered();

    const ok = await send('post', '/auth/verify-otp', { email: address, code: '123456' });
    expect(ok.status).toBe(200);

    const user = await User.findOne({ email: address });
    expect(user.status).toBe('active');
    expect(user.emailVerified).toBe(true);

    expect((await send('post', '/auth/verify-otp', { email: address, code: '123456' })).status).toBe(400);
  });

  it('locks the code after five wrong attempts', async () => {
    const address = await registered();
    for (let i = 0; i < 5; i += 1) {
      expect((await send('post', '/auth/verify-otp', { email: address, code: '000000' })).status).toBe(400);
    }
    expect((await send('post', '/auth/verify-otp', { email: address, code: '123456' })).status).toBe(429);
  });

  it('rejects an expired code', async () => {
    const address = await registered();
    await OtpToken.updateMany({ email: address }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await send('post', '/auth/verify-otp', { email: address, code: '123456' })).status).toBe(400);
  });

  it('does not lift a suspension', async () => {
    const address = await registered();
    await User.updateOne({ email: address }, { status: 'suspended' });

    expect((await send('post', '/auth/verify-otp', { email: address, code: '123456' })).status).toBe(200);

    const user = await User.findOne({ email: address });
    expect(user.emailVerified).toBe(true);
    expect(user.status).toBe('suspended');
  });

  it('validates the code format and answers 404 for unknown accounts', async () => {
    const address = await registered();
    expect((await send('post', '/auth/verify-otp', { email: address, code: '12345' })).status).toBe(422);
    expect((await send('post', '/auth/verify-otp', { email: address, code: 'abcdef' })).status).toBe(422);
    expect((await send('post', '/auth/verify-otp', { email: 'nobody@example.com', code: '123456' })).status).toBe(404);
  });
});

describe('POST /auth/resend-otp', () => {
  it('replaces the previous code for an unverified account', async () => {
    const address = 'resend@example.com';
    await send('post', '/auth/register', { email: address, password: PASSWORD, role: 'candidate' });
    await setOtpCode(address, 'verify-email', '111111');

    expect((await send('post', '/auth/resend-otp', { email: address })).status).toBe(200);
    await setOtpCode(address, 'verify-email', '222222');

    expect((await send('post', '/auth/verify-otp', { email: address, code: '111111' })).status).toBe(400);
    expect((await send('post', '/auth/verify-otp', { email: address, code: '222222' })).status).toBe(200);
  });

  it('refuses verified accounts and answers unknown emails without sending anything', async () => {
    const verified = await makeAccount('candidate');
    expect((await send('post', '/auth/resend-otp', { email: verified.email })).status).toBe(400);

    const unknown = await send('post', '/auth/resend-otp', { email: 'nobody@example.com' });
    expect(unknown.status).toBe(200);
    expect(mailSpy).not.toHaveBeenCalled();
    expect(await OtpToken.countDocuments()).toBe(0);
  });
});

describe('POST /auth/login', () => {
  it('returns a token and the user without secrets, and sets an httpOnly refresh cookie', async () => {
    const user = await makeAccount('candidate', { failedLoginAttempts: 2 });

    const res = await send('post', '/auth/login', { email: user.email.toUpperCase(), password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.accessToken).toEqual(expect.any(String));
    expect(res.body.data.user.email).toBe(user.email);
    expect(res.body.data.user.passwordHash).toBeUndefined();

    const cookie = ([] as string[]).concat(res.headers['set-cookie']).find((c) => c.startsWith('refreshToken='));
    expect(cookie).toMatch(/HttpOnly/i);

    const fresh = await User.findById(user._id);
    expect(fresh.failedLoginAttempts).toBe(0);
    expect(fresh.lastLoginAt).toBeTruthy();
  });

  it('gives the same 401 for an unknown email and a wrong password', async () => {
    const user = await makeAccount('employer');
    const wrong = await send('post', '/auth/login', { email: user.email, password: 'Wrong1!pass' });
    const unknown = await send('post', '/auth/login', { email: 'nobody@example.com', password: PASSWORD });
    expect([wrong.status, unknown.status]).toEqual([401, 401]);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('locks after three failures and lets the user back in once the lock expires', async () => {
    const user = await makeAccount('candidate');
    for (let i = 0; i < 3; i += 1) {
      expect((await send('post', '/auth/login', { email: user.email, password: 'Wrong1!pass' })).status).toBe(401);
    }
    expect((await send('post', '/auth/login', { email: user.email, password: PASSWORD })).status).toBe(423);

    await User.updateOne({ _id: user._id }, { lockedUntil: new Date(Date.now() - 1000) });
    expect((await send('post', '/auth/login', { email: user.email, password: PASSWORD })).status).toBe(200);
  });

  it('refuses suspended accounts and treats deleted ones like unknown emails', async () => {
    const suspended = await makeAccount('candidate', { status: 'suspended' });
    expect((await send('post', '/auth/login', { email: suspended.email, password: PASSWORD })).status).toBe(403);

    const deleted = await makeAccount('employer', { status: 'deleted', deletedAt: new Date() });
    expect((await send('post', '/auth/login', { email: deleted.email, password: PASSWORD })).status).toBe(401);
  });

  it('validates the body', async () => {
    expect((await send('post', '/auth/login', { email: 'a@b.ma' })).status).toBe(422);
    expect((await send('post', '/auth/login', { password: PASSWORD })).status).toBe(422);
  });
});

describe('POST /auth/refresh', () => {
  async function signedIn() {
    const user = await makeAccount('candidate');
    const res = await send('post', '/auth/login', { email: user.email, password: PASSWORD });
    return { user, cookie: refreshCookie(res)! };
  }

  it('rotates the refresh token and revokes the family when an old one is reused', async () => {
    const { cookie: first } = await signedIn();

    const rotated = await refresh(first);
    expect(rotated.status).toBe(200);
    expect(rotated.body.data.accessToken).toEqual(expect.any(String));
    const second = refreshCookie(rotated)!;
    expect(second).not.toBe(first);

    const reuse = await refresh(first);
    expect(reuse.status).toBe(401);
    expect(reuse.body.message).toMatch(/reuse/i);
    expect((await refresh(second)).status).toBe(401);
  });

  it('rejects expired sessions, malformed tokens and a missing cookie', async () => {
    const { user, cookie } = await signedIn();
    await Session.updateMany({ userId: user._id }, { expiresAt: new Date(Date.now() - 1000) });

    expect((await refresh(cookie)).status).toBe(401);
    expect((await refresh('refreshToken=not-a-jwt')).status).toBe(401);
    expect((await refresh()).status).toBe(401);
  });

  it('stops refreshing a suspended account', async () => {
    const { user, cookie } = await signedIn();
    await User.updateOne({ _id: user._id }, { status: 'suspended' });
    expect((await refresh(cookie)).status).toBe(403);
  });
});

describe('POST /auth/logout', () => {
  it('succeeds without a cookie and clears the refresh cookie', async () => {
    const res = await send('post', '/auth/logout');
    expect(res.status).toBe(200);
    expect(
      ([] as string[]).concat(res.headers['set-cookie'] ?? []).some((c) => c.startsWith('refreshToken=;')),
    ).toBe(true);
  });
});

describe('POST /auth/forgot-password', () => {
  it('emails a reset code to local accounts only and answers everyone the same way', async () => {
    const local = await makeAccount('candidate');
    const social = await makeUser('candidate', { authProvider: 'google' });

    const answers = await Promise.all(
      [local.email, social.email, 'nobody@example.com'].map((address) =>
        send('post', '/auth/forgot-password', { email: address }),
      ),
    );
    expect(answers.map((a) => a.status)).toEqual([200, 200, 200]);
    expect(new Set(answers.map((a) => a.body.message)).size).toBe(1);

    expect(await OtpToken.countDocuments({ purpose: 'reset-password' })).toBe(1);
    expect(mailSpy).toHaveBeenCalledTimes(1);
    expect(mailSpy.mock.calls[0][0].to).toBe(local.email);
  });
});

describe('POST /auth/reset-password', () => {
  it('sets the new password, clears a lock and revokes existing sessions', async () => {
    const user = await makeAccount('candidate');
    const login = await send('post', '/auth/login', { email: user.email, password: PASSWORD });
    const oldCookie = refreshCookie(login)!;
    await User.updateOne(
      { _id: user._id },
      { failedLoginAttempts: 3, lockedUntil: new Date(Date.now() + 60_000) },
    );

    await send('post', '/auth/forgot-password', { email: user.email });
    await setOtpCode(user.email, 'reset-password');

    const res = await send('post', '/auth/reset-password', {
      email: user.email,
      code: '123456',
      password: 'NewPass2@',
    });
    expect(res.status).toBe(200);

    expect((await refresh(oldCookie)).status).toBe(401);
    expect((await send('post', '/auth/login', { email: user.email, password: PASSWORD })).status).toBe(401);
    expect((await send('post', '/auth/login', { email: user.email, password: 'NewPass2@' })).status).toBe(200);
  });

  it('answers an unknown email exactly like a wrong code', async () => {
    const user = await makeAccount('candidate');
    await send('post', '/auth/forgot-password', { email: user.email });
    await setOtpCode(user.email, 'reset-password');

    const wrong = await send('post', '/auth/reset-password', {
      email: user.email,
      code: '000000',
      password: 'NewPass2@',
    });
    const unknown = await send('post', '/auth/reset-password', {
      email: 'nobody@example.com',
      code: '123456',
      password: 'NewPass2@',
    });
    expect([wrong.status, unknown.status]).toEqual([400, 400]);
    expect(unknown.body.message).toBe(wrong.body.message);
  });

  it('enforces the password rules', async () => {
    const user = await makeAccount('candidate');
    const res = await send('post', '/auth/reset-password', { email: user.email, code: '123456', password: 'short' });
    expect(res.status).toBe(422);
  });
});

describe('POST /auth/change-password', () => {
  it('changes the password and revokes refresh tokens', async () => {
    const user = await makeAccount('employer');
    const login = await send('post', '/auth/login', { email: user.email, password: PASSWORD });
    const cookie = refreshCookie(login)!;

    const res = await send(
      'post',
      '/auth/change-password',
      { currentPassword: PASSWORD, newPassword: 'NewPass2@' },
      login.body.data.accessToken,
    );
    expect(res.status).toBe(200);
    expect((await refresh(cookie)).status).toBe(401);
    expect((await send('post', '/auth/login', { email: user.email, password: 'NewPass2@' })).status).toBe(200);
  });

  it('answers a wrong current password with 400, since clients read 401 as an expired session', async () => {
    const user = await makeAccount('candidate');
    const res = await send(
      'post',
      '/auth/change-password',
      { currentPassword: 'Wrong1!pass', newPassword: 'NewPass2@' },
      tokenFor(user),
    );
    expect(res.status).toBe(400);
  });

  it('enforces the password rules and requires a session', async () => {
    const user = await makeAccount('candidate');
    const weak = await send(
      'post',
      '/auth/change-password',
      { currentPassword: PASSWORD, newPassword: 'weak' },
      tokenFor(user),
    );
    expect(weak.status).toBe(422);

    const guest = await send('post', '/auth/change-password', { currentPassword: PASSWORD, newPassword: 'NewPass2@' });
    expect(guest.status).toBe(401);
  });
});

describe('GET /auth/me', () => {
  it('returns the account and its role profile without secrets', async () => {
    const cand = await makeCandidate();
    const candMe = await get('/auth/me', cand.token);
    expect(candMe.status).toBe(200);
    expect(candMe.body.data.user.passwordHash).toBeUndefined();
    expect(candMe.body.data.profile.id).toBe(String(cand.profile._id));
    expect(candMe.body.data.completeness).toBe(100);

    const emp = await makeEmployer();
    const empMe = await get('/auth/me', emp.token);
    expect(empMe.body.data.profile).toEqual(
      expect.objectContaining({ id: String(emp.profile._id), logoUrl: null, coverUrl: null }),
    );

    const admin = await makeAdmin();
    const adminMe = await get('/auth/me', admin.token);
    expect(adminMe.body.data).toEqual(expect.objectContaining({ profile: null, completeness: null }));
  });

  it('answers 404 when the account behind a valid token is gone', async () => {
    const user = await makeUser('candidate');
    const token = tokenFor(user);
    await User.deleteOne({ _id: user._id });
    expect((await get('/auth/me', token)).status).toBe(404);
  });
});

describe('notifications', () => {
  async function notify(userId: Types.ObjectId, title: string, extra: Record<string, unknown> = {}) {
    const note = await notificationService.create({
      userId,
      type: 'system',
      title: { fr: title },
      body: { fr: `${title} (corps)` },
    });
    if (Object.keys(extra).length) {
      await Notification.collection.updateOne({ _id: note._id as Types.ObjectId }, { $set: extra });
    }
    return note;
  }

  it("lists only the caller's notifications, newest first, with every language filled in", async () => {
    const me = await makeUser('candidate');
    const other = await makeUser('candidate');
    const first = await notify(me._id, 'Premier');
    await backdate(Notification, first._id, 60_000);
    await notify(me._id, 'Second');
    await notify(other._id, 'Autre');

    const res = await get('/notifications', tokenFor(me));
    expect(res.status).toBe(200);
    expect(res.body.data.map((n: any) => n.title.fr)).toEqual(['Second', 'Premier']);
    expect(res.body.data[0].title).toEqual({ fr: 'Second', ar: 'Second', en: 'Second' });
    expect(res.body.meta).toMatchObject({ page: 1, total: 2 });
  });

  it('filters unread and reports the unread total the navbar badge reads', async () => {
    const me = await makeUser('candidate');
    await notify(me._id, 'A');
    await notify(me._id, 'B');
    await notify(me._id, 'C', { read: true, readAt: new Date() });

    const res = await get('/notifications?read=false&limit=1', tokenFor(me));
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta).toMatchObject({ total: 2, limit: 1, totalPages: 2 });
  });

  it('paginates', async () => {
    const me = await makeUser('employer');
    for (const title of ['A', 'B', 'C']) await notify(me._id, title);

    const page2 = await get('/notifications?page=2&limit=2', tokenFor(me));
    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
  });

  it("marks one as read idempotently and cannot touch another user's", async () => {
    const me = await makeUser('candidate');
    const other = await makeUser('candidate');
    const mine = await notify(me._id, 'Moi');
    const theirs = await notify(other._id, 'Eux');

    const first = await send('patch', `/notifications/${mine._id}/read`, undefined, tokenFor(me));
    expect(first.status).toBe(200);
    expect(first.body.data.read).toBe(true);
    const again = await send('patch', `/notifications/${mine._id}/read`, undefined, tokenFor(me));
    expect(again.body.data.readAt).toBe(first.body.data.readAt);

    expect((await send('patch', `/notifications/${theirs._id}/read`, undefined, tokenFor(me))).status).toBe(404);
    expect((await send('patch', `/notifications/${new Types.ObjectId()}/read`, undefined, tokenFor(me))).status).toBe(404);
    expect((await send('patch', '/notifications/nope/read', undefined, tokenFor(me))).status).toBe(422);
    expect((await Notification.findById(theirs._id))!.read).toBe(false);
  });

  it("marks all of the caller's notifications as read and nobody else's", async () => {
    const me = await makeUser('candidate');
    const other = await makeUser('candidate');
    await notify(me._id, 'A');
    await notify(me._id, 'B');
    await notify(me._id, 'C', { read: true });
    await notify(other._id, 'D');

    const res = await send('patch', '/notifications/read-all', undefined, tokenFor(me));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ count: 2 });
    expect(await Notification.countDocuments({ userId: me._id, read: false })).toBe(0);
    expect(await Notification.countDocuments({ userId: other._id, read: false })).toBe(1);
  });

  it('requires a session', async () => {
    expect((await get('/notifications')).status).toBe(401);
    expect((await send('patch', '/notifications/read-all')).status).toBe(401);
  });
});

describe('POST /feedback', () => {
  it("records feedback under the author's own role, whatever the body says", async () => {
    const cand = await makeCandidate();
    const res = await send('post', '/feedback', { role: 'employer', rating: 4, message: '  Super plateforme  ' }, cand.token);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      role: 'candidate',
      rating: 4,
      message: 'Super plateforme',
      status: 'new',
      messages: [],
    });

    const emp = await makeEmployer();
    const empRes = await send('post', '/feedback', { rating: 5, message: 'Merci' }, emp.token);
    expect(empRes.status).toBe(201);
    expect(empRes.body.data.role).toBe('employer');
  });

  it('refuses admins and guests', async () => {
    const admin = await makeAdmin();
    expect((await send('post', '/feedback', { rating: 5, message: 'x' }, admin.token)).status).toBe(403);
    expect((await send('post', '/feedback', { rating: 5, message: 'x' })).status).toBe(401);
    expect(await Feedback.countDocuments()).toBe(0);
  });

  it.each([
    [{ rating: 0, message: 'x' }],
    [{ rating: 6, message: 'x' }],
    [{ rating: 2.5, message: 'x' }],
    [{ rating: '5', message: 'x' }],
    [{ rating: 3, message: '   ' }],
    [{ rating: 3, message: 'x'.repeat(5001) }],
    [{ message: 'x' }],
  ])('rejects %j with 422', async (body) => {
    const cand = await makeCandidate();
    expect((await send('post', '/feedback', body, cand.token)).status).toBe(422);
  });
});

describe('admin feedback', () => {
  it('lists newest first with the author email, and filters by role, status and search', async () => {
    const admin = await makeAdmin();
    const cand = await makeCandidate();
    const emp = await makeEmployer();
    const older = await Feedback.create({
      userId: cand.user._id,
      role: 'candidate',
      rating: 5,
      message: 'Les offres sont claires',
      status: 'new',
    });
    const newer = await Feedback.create({
      userId: emp.user._id,
      role: 'employer',
      rating: 2,
      message: 'Trop de profils incomplets',
      status: 'answered',
    });
    await backdate(Feedback, older._id, 60_000);
    const ids = (res: request.Response) => res.body.data.map((f: any) => f.id);

    const all = await get('/admin/feedback', admin.token);
    expect(ids(all)).toEqual([String(newer._id), String(older._id)]);
    expect(all.body.data[1]).toMatchObject({ from: cand.user.email, user: { email: cand.user.email } });

    expect(ids(await get('/admin/feedback?role=employer', admin.token))).toEqual([String(newer._id)]);
    expect(ids(await get('/admin/feedback?status=new', admin.token))).toEqual([String(older._id)]);
    expect(ids(await get('/admin/feedback?q=INCOMPLETS', admin.token))).toEqual([String(newer._id)]);

    const byEmail = await get(`/admin/feedback?q=${encodeURIComponent(cand.user.email)}`, admin.token);
    expect(ids(byEmail)).toEqual([String(older._id)]);
    expect(byEmail.body.meta.total).toBe(1);

    expect((await get('/admin/feedback?q=(', admin.token)).status).toBe(200);
  });

  it('a reply threads the message, marks it answered, notifies the author and logs the admin', async () => {
    const admin = await makeAdmin();
    const cand = await makeCandidate();
    const feedback = await Feedback.create({
      userId: cand.user._id,
      role: 'candidate',
      rating: 3,
      message: 'Question',
      status: 'new',
    });

    const res = await send('post', `/admin/feedback/${feedback._id}/reply`, { body: ' Merci pour votre retour ' }, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('answered');
    expect(res.body.data.messages).toEqual([
      expect.objectContaining({ role: 'admin', body: 'Merci pour votre retour', authorUserId: String(admin.user._id) }),
    ]);

    await send('post', `/admin/feedback/${feedback._id}/reply`, { body: 'Deuxième réponse' }, admin.token);
    expect((await Feedback.findById(feedback._id)).messages).toHaveLength(2);

    const notes = await Notification.find({ userId: cand.user._id, type: 'feedback-reply' });
    expect(notes.map((n) => n.body.fr).sort()).toEqual(['Deuxième réponse', 'Merci pour votre retour']);

    const logs = await ActivityLog.find({ action: 'feedback.replied' });
    expect(logs).toHaveLength(2);
    expect(String(logs[0].actorUserId)).toBe(String(admin.user._id));
  });

  it('validates replies and requires manage-feedback', async () => {
    const admin = await makeAdmin();
    const cand = await makeCandidate();
    const feedback = await Feedback.create({ userId: cand.user._id, role: 'candidate', rating: 3, message: 'x' });

    expect((await send('post', `/admin/feedback/${feedback._id}/reply`, { body: '  ' }, admin.token)).status).toBe(422);
    expect((await send('post', `/admin/feedback/${new Types.ObjectId()}/reply`, { body: 'x' }, admin.token)).status).toBe(404);

    const moderator = await makeAdmin(['approve-photos'], 'sub');
    expect((await get('/admin/feedback', moderator.token)).status).toBe(403);
    expect((await send('post', `/admin/feedback/${feedback._id}/reply`, { body: 'x' }, moderator.token)).status).toBe(403);

    const support = await makeAdmin(['manage-feedback'], 'sub');
    expect((await get('/admin/feedback', support.token)).status).toBe(200);
  });
});

const bannerBody = { placement: 'home-middle', title: { fr: 'Recrutez vite' }, href: '/jobPost' };

describe('banners', () => {
  it('admins create banners with defaults and the public list shows only live ones, in order', async () => {
    const admin = await makeAdmin();
    const image = await makeMedia(admin.user._id, 'banner', { moderationStatus: 'approved' });

    const second = await send('post', '/admin/banners', { ...bannerBody, imageId: String(image._id), order: 2 }, admin.token);
    expect(second.status).toBe(201);
    expect(second.body.data).toMatchObject({
      subtitle: { fr: '' },
      cta: { fr: '' },
      active: true,
      impressions: 0,
      clicks: 0,
    });

    const first = await send('post', '/admin/banners', { ...bannerBody, order: 1, href: 'https://partner.ma/offre' }, admin.token);
    const day = 86_400_000;
    await send('post', '/admin/banners', { ...bannerBody, active: false }, admin.token);
    await send('post', '/admin/banners', { ...bannerBody, startsAt: new Date(Date.now() + day).toISOString() }, admin.token);
    await send('post', '/admin/banners', { ...bannerBody, endsAt: new Date(Date.now() - day).toISOString() }, admin.token);
    await send('post', '/admin/banners', { ...bannerBody, placement: 'sticky' }, admin.token);

    const middle = await get('/banners?placement=home-middle');
    expect(middle.status).toBe(200);
    expect(middle.body.data.map((b: any) => b.id)).toEqual([first.body.data.id, second.body.data.id]);
    expect(middle.body.data[0].imageUrl).toBeNull();
    expect(middle.body.data[1].imageUrl).toBe(image.url);
    expect((await Banner.findById(first.body.data.id)).impressions).toBe(1);

    expect((await get('/banners')).body.data).toHaveLength(3);
    expect((await get('/banners?placement=nowhere')).status).toBe(422);
  });

  it('refuses unsafe links and schedules that end before they start', async () => {
    const admin = await makeAdmin();
    for (const href of ['javascript:alert(1)', '//evil.example', 'data:text/html,x', 'www.site.ma']) {
      expect((await send('post', '/admin/banners', { ...bannerBody, href }, admin.token)).status).toBe(422);
    }

    const inverted = { ...bannerBody, startsAt: '2030-10-10', endsAt: '2030-10-01' };
    expect((await send('post', '/admin/banners', inverted, admin.token)).status).toBe(422);

    const scheduled = await send('post', '/admin/banners', { ...bannerBody, startsAt: '2030-10-10' }, admin.token);
    const patched = await send('patch', `/admin/banners/${scheduled.body.data.id}`, { endsAt: '2030-10-01' }, admin.token);
    expect(patched.status).toBe(422);
    expect(await Banner.countDocuments()).toBe(1);
  });

  it('counts clicks only on banners the public can currently see', async () => {
    const live = await Banner.create({ ...bannerBody });
    const hidden = await Banner.create({ ...bannerBody, active: false });
    const future = await Banner.create({ ...bannerBody, startsAt: new Date(Date.now() + 86_400_000) });
    const removed = await Banner.create({ ...bannerBody, deletedAt: new Date() });

    const ok = await send('post', `/banners/${live._id}/click`);
    expect(ok.status).toBe(200);
    expect(ok.body.data.clicks).toBe(1);

    for (const banner of [hidden, future, removed]) {
      expect((await send('post', `/banners/${banner._id}/click`)).status).toBe(404);
    }
    expect((await send('post', '/banners/not-an-id/click')).status).toBe(422);
    expect((await Banner.findById(hidden._id)).clicks).toBe(0);
  });

  it('admins list every banner with filters, update them and soft-delete them', async () => {
    const admin = await makeAdmin();
    const middle = await Banner.create({ ...bannerBody, order: 1 });
    const sticky = await Banner.create({ ...bannerBody, placement: 'sticky', active: false, order: 0 });
    const ids = (res: request.Response) => res.body.data.map((b: any) => b.id);

    const list = await get('/admin/banners', admin.token);
    expect(ids(list)).toEqual([String(sticky._id), String(middle._id)]);
    expect(list.body.meta.total).toBe(2);
    expect(ids(await get('/admin/banners?active=false', admin.token))).toEqual([String(sticky._id)]);
    expect(ids(await get('/admin/banners?placement=home-middle', admin.token))).toEqual([String(middle._id)]);

    const updated = await send('patch', `/admin/banners/${sticky._id}`, { active: true, title: { fr: 'Nouveau', en: 'New' } }, admin.token);
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({ active: true, title: { fr: 'Nouveau', en: 'New' } });

    expect((await send('delete', `/admin/banners/${middle._id}`, undefined, admin.token)).status).toBe(200);
    expect((await send('delete', `/admin/banners/${middle._id}`, undefined, admin.token)).status).toBe(404);
    expect((await get('/admin/banners', admin.token)).body.meta.total).toBe(1);
    expect(ids(await get('/banners'))).toEqual([String(sticky._id)]);
    expect((await send('patch', `/admin/banners/${new Types.ObjectId()}`, { active: true }, admin.token)).status).toBe(404);
  });

  it('requires manage-banners', async () => {
    const homepage = await makeAdmin(['manage-homepage'], 'sub');
    const marketing = await makeAdmin(['manage-banners'], 'sub');
    expect((await get('/admin/banners', homepage.token)).status).toBe(403);
    expect((await send('post', '/admin/banners', bannerBody, homepage.token)).status).toBe(403);
    expect((await get('/admin/banners', marketing.token)).status).toBe(200);
  });
});

describe('partners', () => {
  it('admin create, update and delete are reflected on the public list', async () => {
    const admin = await makeAdmin();
    const logo = await makeMedia(admin.user._id, 'logo', { moderationStatus: 'approved' });

    const ofppt = await send('post', '/admin/partners', { name: ' OFPPT ', href: 'https://www.ofppt.ma', logoId: String(logo._id), order: 2 }, admin.token);
    expect(ofppt.status).toBe(201);
    expect(ofppt.body.data.name).toBe('OFPPT');
    const ahrm = await send('post', '/admin/partners', { name: 'AHRM', href: '/partenaires/ahrm', order: 1 }, admin.token);
    await send('post', '/admin/partners', { name: 'Inactif', href: '/x', active: false }, admin.token);

    const pub = await get('/partners');
    expect(pub.body.data.map((p: any) => p.name)).toEqual(['AHRM', 'OFPPT']);
    expect(pub.body.data[1].logoUrl).toBe(logo.url);

    const adminList = await get('/admin/partners', admin.token);
    expect(adminList.body.data.map((p: any) => p.name)).toEqual(['Inactif', 'AHRM', 'OFPPT']);
    expect(adminList.body.meta.total).toBe(3);
    expect((await get('/admin/partners?active=false', admin.token)).body.data.map((p: any) => p.name)).toEqual(['Inactif']);

    const patched = await send('patch', `/admin/partners/${ahrm.body.data.id}`, { active: false }, admin.token);
    expect(patched.body.data.active).toBe(false);
    expect((await send('delete', `/admin/partners/${ofppt.body.data.id}`, undefined, admin.token)).status).toBe(200);
    expect((await get('/partners')).body.data).toEqual([]);
    expect((await send('delete', `/admin/partners/${ofppt.body.data.id}`, undefined, admin.token)).status).toBe(404);
  });

  it('refuses unsafe links and empty names, and requires manage-banners', async () => {
    const admin = await makeAdmin();
    expect((await send('post', '/admin/partners', { name: 'X', href: 'javascript:alert(1)' }, admin.token)).status).toBe(422);
    expect((await send('post', '/admin/partners', { name: '  ', href: '/x' }, admin.token)).status).toBe(422);

    const partner = await send('post', '/admin/partners', { name: 'X', href: '/x' }, admin.token);
    expect((await send('patch', `/admin/partners/${partner.body.data.id}`, { href: 'vbscript:x' }, admin.token)).status).toBe(422);

    const homepage = await makeAdmin(['manage-homepage'], 'sub');
    expect((await get('/admin/partners', homepage.token)).status).toBe(403);
  });
});

describe('site settings', () => {
  it('serves defaults publicly and reflects admin edits', async () => {
    const pub = await get('/site-settings');
    expect(pub.status).toBe(200);
    expect(pub.body.data).toMatchObject({ mode: 'blank', imageUrl: null, headline: { fr: expect.any(String) } });

    const editor = await makeAdmin(['manage-homepage'], 'sub');
    const res = await send(
      'patch',
      '/admin/site-settings',
      { headline: { fr: 'Bienvenue', ar: 'مرحبا', en: 'Welcome' }, cta: { fr: 'Voir' } },
      editor.token,
    );
    expect(res.status).toBe(200);
    expect((await get('/site-settings')).body.data).toMatchObject({
      headline: { fr: 'Bienvenue', ar: 'مرحبا', en: 'Welcome' },
      cta: { fr: 'Voir' },
    });
  });

  it('uses an uploaded background and returns its URL to the dashboard as well as the site', async () => {
    const admin = await makeAdmin();
    const image = await makeMedia(admin.user._id, 'homepage', { moderationStatus: 'approved' });

    const res = await send('patch', '/admin/site-settings', { mode: 'image', imageId: String(image._id) }, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ mode: 'image', imageId: String(image._id), imageUrl: image.url });
    expect((await get('/admin/site-settings', admin.token)).body.data.imageUrl).toBe(image.url);
    expect((await get('/site-settings')).body.data.imageUrl).toBe(image.url);

    const cleared = await send('patch', '/admin/site-settings', { imageId: null }, admin.token);
    expect(cleared.body.data).toMatchObject({ mode: 'blank', imageId: null, imageUrl: null });
  });

  it('falls back to a blank background when image mode has no image', async () => {
    const admin = await makeAdmin();
    const res = await send('patch', '/admin/site-settings', { mode: 'image' }, admin.token);
    expect(res.body.data.mode).toBe('blank');
  });

  it('refuses unknown images and invalid content, and requires manage-homepage', async () => {
    const admin = await makeAdmin();
    const unknownImage = { mode: 'image', imageId: String(new Types.ObjectId()) };
    expect((await send('patch', '/admin/site-settings', unknownImage, admin.token)).status).toBe(422);
    expect((await send('patch', '/admin/site-settings', { headline: { fr: '  ' } }, admin.token)).status).toBe(422);
    expect((await send('patch', '/admin/site-settings', { mode: 'video' }, admin.token)).status).toBe(422);

    const marketing = await makeAdmin(['manage-banners'], 'sub');
    expect((await get('/admin/site-settings', marketing.token)).status).toBe(403);
    expect((await send('patch', '/admin/site-settings', { mode: 'blank' }, marketing.token)).status).toBe(403);
  });
});

describe('taxonomies', () => {
  it('the public list returns active entries, and positions by sector', async () => {
    const all = await get('/taxonomies');
    expect(all.status).toBe(200);
    expect(all.body.data.map((t: any) => `${t.type}:${t.key}`).sort()).toEqual(['position:head-chef', 'sector:kitchen']);
    expect(all.body.data.find((t: any) => t.key === 'head-chef')).toMatchObject({
      parentKey: 'kitchen',
      meta: { allowsFoodPhotos: true },
      label: { fr: 'Chef' },
    });

    expect((await get('/taxonomies/positions?sectorId=kitchen')).body.data.map((t: any) => t.key)).toEqual(['head-chef']);
    expect((await get('/taxonomies/positions?sectorId=pastry')).body.data).toEqual([]);
    expect((await get('/taxonomies/positions')).body.data).toEqual([]);
  });

  it('admin edits take effect immediately without breaking position checks elsewhere', async () => {
    const admin = await makeAdmin();

    const created = await send('post', '/admin/taxonomies', { type: 'city', key: 'agadir', label: { fr: 'Agadir' } }, admin.token);
    expect(created.status).toBe(201);
    expect(() => taxonomyService.ensurePositionBelongsToSector('head-chef', 'kitchen')).not.toThrow();
    expect((await get('/taxonomies')).body.data.some((t: any) => t.key === 'agadir')).toBe(true);

    const emp = await makeEmployer();
    expect((await send('post', '/jobs', jobBody, emp.token)).status).toBe(201);

    const duplicate = await send('post', '/admin/taxonomies', { type: 'city', key: 'agadir', label: { fr: 'Agadir' } }, admin.token);
    expect(duplicate.status).toBe(409);

    const hidden = await send('patch', '/admin/taxonomies/city/agadir', { label: { fr: 'Agadir Ida-Outanane' }, active: false }, admin.token);
    expect(hidden.status).toBe(200);
    expect(hidden.body.data.label.fr).toBe('Agadir Ida-Outanane');
    expect((await get('/taxonomies')).body.data.some((t: any) => t.key === 'agadir')).toBe(false);

    expect((await send('delete', '/admin/taxonomies/city/agadir', undefined, admin.token)).status).toBe(200);
    expect((await send('delete', '/admin/taxonomies/city/agadir', undefined, admin.token)).status).toBe(404);
  });

  it('validates input and requires manage-admins', async () => {
    const admin = await makeAdmin();
    expect((await send('patch', '/admin/taxonomies/planet/mars', { order: 1 }, admin.token)).status).toBe(422);
    expect((await send('post', '/admin/taxonomies', { type: 'city', key: 'x', label: { fr: '' } }, admin.token)).status).toBe(422);
    expect((await send('post', '/admin/taxonomies', { type: 'galaxy', key: 'x', label: { fr: 'X' } }, admin.token)).status).toBe(422);

    const homepage = await makeAdmin(['manage-homepage'], 'sub');
    expect((await send('post', '/admin/taxonomies', { type: 'city', key: 'y', label: { fr: 'Y' } }, homepage.token)).status).toBe(403);
  });
});

describe('dashboard and statistics', () => {
  it('counters reflect an offer decision immediately', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    await makeCandidate();
    const pending = await makeJob(emp.profile._id, 'pending');
    await makeJob(emp.profile._id, 'active');

    expect((await get('/admin/dashboard/stats', admin.token)).body.data).toEqual({
      candidates: 1,
      employers: 1,
      activeJobs: 1,
      pendingJobs: 1,
    });
    expect((await get('/admin/statistics?days=7', admin.token)).body.data.offers).toMatchObject({ active: 1, pendingApproval: 1 });

    const approve = await send('patch', `/admin/jobs/${pending._id}/decision`, { status: 'active' }, admin.token);
    expect(approve.status).toBe(200);

    expect((await get('/admin/dashboard/stats', admin.token)).body.data).toMatchObject({ activeJobs: 2, pendingJobs: 0 });
    expect((await get('/admin/statistics?days=7', admin.token)).body.data.offers).toMatchObject({ active: 2, pendingApproval: 0 });
  });

  it('statistics returns series for the requested range and validates it', async () => {
    const admin = await makeAdmin();
    await makeCandidate();
    await makeEmployer();

    const res = await get('/admin/statistics?days=14', admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data.days).toBe(14);
    expect(res.body.data.candidatesPerDay).toHaveLength(14);
    expect(res.body.data.candidatesPerDay.at(-1)).toEqual({ day: new Date().toISOString().slice(0, 10), count: 1 });
    expect(res.body.data.employersPerMonth).toHaveLength(12);
    expect(res.body.data.candidatesByPosition).toEqual([{ id: 'head-chef', count: 1 }]);
    expect(res.body.data.employersByType).toEqual([{ id: 'restaurant', count: 1 }]);
    expect(res.body.data.candidates).toMatchObject({ total: 1, complete: 1 });

    for (const days of ['0', '366', 'abc']) {
      expect((await get(`/admin/statistics?days=${days}`, admin.token)).status).toBe(422);
    }
  });

  it('growth buckets registrations by month and validates the metric and year', async () => {
    const admin = await makeAdmin();
    await makeCandidate();
    await makeEmployer();
    const year = new Date().getUTCFullYear();
    const month = String(new Date().getUTCMonth() + 1).padStart(2, '0');

    const cooks = await get(`/admin/dashboard/growth?metric=cooks&year=${year}`, admin.token);
    expect(cooks.body.data).toMatchObject({ year, metric: 'cooks' });
    expect(cooks.body.data.buckets).toHaveLength(12);
    expect(cooks.body.data.buckets.find((b: any) => b.month === month).count).toBe(1);

    const restaurants = await get(`/admin/dashboard/growth?metric=restaurants&year=${year}`, admin.token);
    expect(restaurants.body.data.buckets.find((b: any) => b.month === month).count).toBe(1);

    expect((await get('/admin/dashboard/growth?metric=chefs', admin.token)).status).toBe(422);
    expect((await get('/admin/dashboard/growth?year=1999', admin.token)).status).toBe(422);
  });

  it('market aggregates searches and the average offered salary', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    await makeJob(emp.profile._id, 'active', { salaryMin: 4000, salaryMax: 6000 });
    await makeJob(emp.profile._id, 'active', { salaryMin: 8000, salaryMax: 10000 });
    await SearchEvent.create([
      { kind: 'job-search', filters: { positionId: 'head-chef', city: 'rabat' } },
      { kind: 'job-search', filters: { positionId: 'head-chef', city: 'casablanca' } },
      { kind: 'candidate-search', filters: { city: 'rabat' } },
    ]);

    const res = await get('/admin/dashboard/market', admin.token);
    expect(res.body.data).toEqual({
      searchedPositions: [{ id: 'head-chef', count: 2 }],
      searchedCities: [
        { id: 'rabat', count: 2 },
        { id: 'casablanca', count: 1 },
      ],
      averageSalary: 7000,
    });
  });

  it('every analytics route requires view-statistics', async () => {
    const marketing = await makeAdmin(['manage-banners'], 'sub');
    const analyst = await makeAdmin(['view-statistics'], 'sub');
    for (const path of ['/admin/dashboard/stats', '/admin/dashboard/growth?year=2001', '/admin/statistics?days=3']) {
      expect((await get(path, marketing.token)).status).toBe(403);
      expect((await get(path, analyst.token)).status).toBe(200);
    }
  });
});

describe('GET /admin/activity', () => {
  it('lists newest first with a type, and filters by kind', async () => {
    const admin = await makeAdmin();
    const targetId = new Types.ObjectId();
    const entries: Array<[string, number]> = [
      ['feedback.replied', 3],
      ['contact.revealed', 2],
      ['photo.rejected', 1],
    ];
    for (const [action, minutesAgo] of entries) {
      const log = await ActivityLog.create({
        actorUserId: admin.user._id,
        actorLabel: 'Admin',
        action,
        targetType: 'candidate',
        targetId,
        detail: { fr: action },
      });
      await backdate(ActivityLog, log._id, minutesAgo * 60_000);
    }

    const all = await get('/admin/activity', admin.token);
    expect(all.body.data.map((l: any) => [l.action, l.type])).toEqual([
      ['photo.rejected', 'photo'],
      ['contact.revealed', 'contact-access'],
      ['feedback.replied', 'admin-action'],
    ]);
    expect(all.body.meta.total).toBe(3);

    const actions = async (type: string) =>
      (await get(`/admin/activity?type=${type}`, admin.token)).body.data.map((l: any) => l.action);
    expect(await actions('admin-action')).toEqual(['feedback.replied']);
    expect(await actions('contact-access')).toEqual(['contact.revealed']);
    expect(await actions('photo')).toEqual(['photo.rejected']);
    expect((await get('/admin/activity?type=everything', admin.token)).status).toBe(422);
  });

  it('requires view-activity, the permission the dashboard gates it with', async () => {
    const moderator = await makeAdmin(['approve-photos'], 'sub');
    const auditor = await makeAdmin(['view-activity'], 'sub');
    expect((await get('/admin/activity', moderator.token)).status).toBe(403);
    expect((await get('/admin/activity', auditor.token)).status).toBe(200);
  });
});

describe('POST /admin/media', () => {
  const storedKeys: string[] = [];

  afterEach(async () => {
    await Promise.all(storedKeys.splice(0).map((key) => getStorage().delete(key)));
  });

  const png = (width: number, height: number) =>
    sharp({ create: { width, height, channels: 3, background: '#e87b35' } }).png().toBuffer();

  function upload(token: string, file?: { buffer: Buffer; name: string; type: string }, kind?: string) {
    const req = request(app).post(`${API}/admin/media`).set('Authorization', `Bearer ${token}`);
    if (kind) req.field('kind', kind);
    if (file) req.attach('file', file.buffer, { filename: file.name, contentType: file.type });
    return req;
  }

  it('stores homepage and banner images as approved media named by their real type', async () => {
    const editor = await makeAdmin(['manage-homepage'], 'sub');

    const hero = await upload(editor.token, { buffer: await png(1600, 700), name: 'hero.png', type: 'image/png' });
    expect(hero.status).toBe(201);
    expect(hero.body.data).toEqual({
      id: expect.any(String),
      url: expect.stringMatching(/^\/uploads\/admin\/homepage-.+\.png$/),
    });
    const heroAsset = await MediaAsset.findById(hero.body.data.id);
    storedKeys.push(heroAsset.storageKey);
    expect(heroAsset.toObject()).toMatchObject({ kind: 'homepage', moderationStatus: 'approved', width: 1600, height: 700 });

    const banner = await upload(editor.token, { buffer: await png(800, 800), name: 'page.html', type: 'image/png' }, 'banner');
    expect(banner.status).toBe(201);
    const bannerAsset = await MediaAsset.findById(banner.body.data.id);
    storedKeys.push(bannerAsset.storageKey);
    expect(bannerAsset.kind).toBe('banner');
    expect(banner.body.data.url).toMatch(/\.png$/);
  });

  it('rejects missing, non-image, undersized, fake and unknown-kind uploads', async () => {
    const admin = await makeAdmin();
    expect((await upload(admin.token)).status).toBe(422);
    expect((await upload(admin.token, { buffer: Buffer.from('%PDF-1.4'), name: 'x.pdf', type: 'application/pdf' })).status).toBe(422);
    expect((await upload(admin.token, { buffer: await png(100, 100), name: 's.png', type: 'image/png' })).status).toBe(422);
    expect((await upload(admin.token, { buffer: Buffer.from('not an image'), name: 'f.png', type: 'image/png' })).status).toBe(422);
    expect((await upload(admin.token, { buffer: await png(800, 800), name: 'k.png', type: 'image/png' }, 'avatar')).status).toBe(422);
    expect(await MediaAsset.countDocuments()).toBe(0);
  });

  it('requires manage-homepage', async () => {
    const marketing = await makeAdmin(['manage-banners'], 'sub');
    const res = await upload(marketing.token, { buffer: await png(800, 800), name: 'b.png', type: 'image/png' });
    expect(res.status).toBe(403);
  });
});

describe('GET /admin/notifications/outbox', () => {
  it('lists notifications newest first with the recipient and email state', async () => {
    const support = await makeAdmin(['manage-feedback'], 'sub');
    const cand = await makeCandidate();
    const older = await notificationService.create({ userId: cand.user._id, type: 'system', title: { fr: 'Ancien' }, body: { fr: 'x' } });
    await backdate(Notification, older._id, 60_000, { emailSentAt: new Date() });
    await notificationService.create({ userId: cand.user._id, type: 'approval', title: { fr: 'Récent' }, body: { fr: 'y' } });

    const res = await get('/admin/notifications/outbox', support.token);
    expect(res.status).toBe(200);
    expect(res.body.data.map((n: any) => n.title.fr)).toEqual(['Récent', 'Ancien']);
    expect(res.body.data[0]).toMatchObject({
      type: 'approval',
      to: { id: String(cand.user._id), email: cand.user.email },
      emailQueued: true,
    });
    expect(res.body.data[1].emailQueued).toBe(false);

    expect((await get('/admin/notifications/outbox?limit=1', support.token)).body.data).toHaveLength(1);
    expect((await get('/admin/notifications/outbox?limit=0', support.token)).status).toBe(422);
  });

  it('requires manage-feedback, the permission the dashboard gates it with', async () => {
    const moderator = await makeAdmin(['approve-photos'], 'sub');
    expect((await get('/admin/notifications/outbox', moderator.token)).status).toBe(403);
  });
});

describe('admin accounts', () => {
  it('lists admins without secrets and creates sub-admins who can sign in', async () => {
    const admin = await makeAdmin();
    await makeCandidate();

    const created = await send(
      'post',
      '/admin/admins',
      { email: 'Nouvel.Admin@Nkhedmou.ma', password: 'Strong1!pass', permissions: ['approve-photos', 'manage-feedback'] },
      admin.token,
    );
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      email: 'nouvel.admin@nkhedmou.ma',
      role: 'admin',
      adminLevel: 'sub',
      status: 'active',
      emailVerified: true,
      permissions: ['approve-photos', 'manage-feedback'],
    });
    expect(created.body.data.passwordHash).toBeUndefined();

    const list = await get('/admin/admins', admin.token);
    expect(list.body.data.map((a: any) => a.email).sort()).toEqual([admin.user.email, 'nouvel.admin@nkhedmou.ma'].sort());

    expect((await send('post', '/auth/login', { email: 'nouvel.admin@nkhedmou.ma', password: 'Strong1!pass' })).status).toBe(200);

    const log = await ActivityLog.findOne({ action: 'admin.created' });
    expect(String(log.actorUserId)).toBe(String(admin.user._id));
  });

  it('refuses weak passwords, unknown permissions and duplicate emails', async () => {
    const admin = await makeAdmin();
    for (const password of ['short1!', 'alllowercase1!', 'NoDigitsHere!', 'NoSpecial123']) {
      expect((await send('post', '/admin/admins', { email: 'weak@nkhedmou.ma', password }, admin.token)).status).toBe(422);
    }
    const unknownPermission = { email: 'x@nkhedmou.ma', password: 'Strong1!pass', permissions: ['root'] };
    expect((await send('post', '/admin/admins', unknownPermission, admin.token)).status).toBe(422);
    const duplicate = { email: admin.user.email.toUpperCase(), password: 'Strong1!pass' };
    expect((await send('post', '/admin/admins', duplicate, admin.token)).status).toBe(409);
  });

  it("super admins replace a sub-admin's permissions but cannot edit another super admin", async () => {
    const admin = await makeAdmin();
    const sub = await makeAdmin(['approve-photos'], 'sub');

    const res = await send('patch', `/admin/admins/${sub.user._id}`, { permissions: ['manage-feedback'] }, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data.permissions).toEqual(['manage-feedback']);

    const otherSuper = await makeAdmin();
    expect((await send('patch', `/admin/admins/${otherSuper.user._id}`, { permissions: [] }, admin.token)).status).toBe(403);
    const cand = await makeCandidate();
    expect((await send('patch', `/admin/admins/${cand.user._id}`, { permissions: [] }, admin.token)).status).toBe(404);
    expect((await send('patch', `/admin/admins/${sub.user._id}`, {}, admin.token)).status).toBe(422);
    expect(await ActivityLog.countDocuments({ action: 'admin.permissionsChanged' })).toBe(1);
  });

  it('a sub-admin who manages admins only controls the rights they hold', async () => {
    const manager = await makeAdmin(['manage-admins', 'approve-photos'], 'sub');
    const target = await makeAdmin(['export-cv', 'view-contact'], 'sub');

    const res = await send(
      'patch',
      `/admin/admins/${target.user._id}`,
      { permissions: ['approve-photos', 'delete-users'] },
      manager.token,
    );
    expect(res.status).toBe(200);
    expect([...res.body.data.permissions].sort()).toEqual(['approve-photos', 'export-cv', 'view-contact']);

    const escalate = { permissions: ['manage-admins', 'approve-photos', 'delete-users'] };
    expect((await send('patch', `/admin/admins/${manager.user._id}`, escalate, manager.token)).status).toBe(403);
  });

  it('disabling cuts off sign-in and refresh; re-enabling applies status and permissions together', async () => {
    const admin = await makeAdmin();
    const sub = await makeAccount('admin', { adminLevel: 'sub', permissions: ['approve-photos'] });
    const login = await send('post', '/auth/login', { email: sub.email, password: PASSWORD });
    const cookie = refreshCookie(login)!;

    const disabled = await send('delete', `/admin/admins/${sub._id}`, undefined, admin.token);
    expect(disabled.status).toBe(200);
    expect(disabled.body.data.status).toBe('suspended');
    expect((await send('post', '/auth/login', { email: sub.email, password: PASSWORD })).status).toBe(403);
    expect((await refresh(cookie)).status).toBe(403);

    const enabled = await send('patch', `/admin/admins/${sub._id}`, { status: 'active', permissions: ['manage-feedback'] }, admin.token);
    expect(enabled.status).toBe(200);
    expect(enabled.body.data).toMatchObject({ status: 'active', permissions: ['manage-feedback'] });
    expect((await send('post', '/auth/login', { email: sub.email, password: PASSWORD })).status).toBe(200);

    const otherSuper = await makeAdmin();
    expect((await send('delete', `/admin/admins/${otherSuper.user._id}`, undefined, admin.token)).status).toBe(403);
    const actions = (await ActivityLog.find({ action: { $in: ['admin.disabled', 'admin.enabled'] } })).map((l: any) => l.action);
    expect(actions.sort()).toEqual(['admin.disabled', 'admin.enabled']);
  });

  it('requires manage-admins', async () => {
    const moderator = await makeAdmin(['approve-photos'], 'sub');
    expect((await get('/admin/admins', moderator.token)).status).toBe(403);
    expect((await send('post', '/admin/admins', { email: 'x@y.ma', password: 'Strong1!pass' }, moderator.token)).status).toBe(403);
  });
});
