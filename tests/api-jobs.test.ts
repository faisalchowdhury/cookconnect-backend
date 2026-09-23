import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app';
import { expireOffers } from '../src/jobs/expireOffers';
import { ActivityLog } from '../src/modules/activityLog/activityLog.model';
import { Application } from '../src/modules/application/application.model';
import { EMPLOYER_TYPES } from '../src/modules/employer/employer.constant';
import { EmployerProfile } from '../src/modules/employer/employer.model';
import { Job } from '../src/modules/job/job.model';
import { ModerationReport } from '../src/modules/media/moderationReport.model';
import { Notification } from '../src/modules/notification/notification.model';
import { User } from '../src/modules/user/user.model';
import {
  API,
  type AnyDoc,
  jobBody,
  makeAdmin,
  makeCandidate,
  makeEmployer,
  makeJob,
  seedTaxonomy,
} from './helpers/fixtures';

const app = createApp();
const Notifications = Notification as any;
const Activity = ActivityLog as any;
const Reports = ModerationReport as any;
const DAY = 86_400_000;

beforeEach(seedTaxonomy);

function withToken(req: request.Test, token?: string) {
  return token ? req.set('Authorization', `Bearer ${token}`) : req;
}
const get = (path: string, token?: string) => withToken(request(app).get(`${API}${path}`), token);
const post = (path: string, token?: string, body: object = {}) =>
  withToken(request(app).post(`${API}${path}`), token).send(body);
const patch = (path: string, token: string, body: object = {}) =>
  withToken(request(app).patch(`${API}${path}`), token).send(body);
const del = (path: string, token: string) => withToken(request(app).delete(`${API}${path}`), token);

const idsOf = (rows: AnyDoc[]) => rows.map((row) => row.id).sort();
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString();

describe('GET /jobs', () => {
  it('lists only active offers, with the fields the site reads', async () => {
    const emp = await makeEmployer();
    const active = await makeJob(emp.profile._id, 'active', { salaryMin: 4000, salaryMax: 6000 });
    for (const status of ['draft', 'pending', 'rejected', 'expired', 'closed']) {
      await makeJob(emp.profile._id, status);
    }
    const deleted = await makeJob(emp.profile._id, 'active');
    await deleted.softDelete();

    const res = await get('/jobs');
    expect(res.status).toBe(200);
    expect(idsOf(res.body.data)).toEqual([String(active._id)]);
    expect(res.body.meta).toMatchObject({ page: 1, limit: 12, total: 1, totalPages: 1, gated: true });
    expect(res.body.data[0]).toMatchObject({
      status: 'active',
      city: 'casablanca',
      employerId: String(emp.profile._id),
      salaryMin: 4000,
      salaryMax: 6000,
      title: { fr: 'Chef de partie' },
    });
    expect(res.body.data[0].postedAt).toBeTruthy();
    expect(res.body.data[0].expiresAt).toBeTruthy();
  });

  it('filters by every supported criterion and searches titles and descriptions', async () => {
    const otherType = EMPLOYER_TYPES.find((t) => t !== 'restaurant')!;
    const emp = await makeEmployer();
    const hotel = await makeEmployer();
    await EmployerProfile.updateOne({ _id: hotel.profile._id }, { type: otherType });
    const cand = await makeCandidate();

    const base = await makeJob(emp.profile._id, 'active');
    const rabat = await makeJob(emp.profile._id, 'active', {
      city: 'rabat',
      contractType: 'cdd',
      experience: '3-5',
      sectorId: 'pastry',
      positionId: 'pastry-chef',
      description: { fr: 'Viennoiseries fines' },
    });
    const atHotel = await makeJob(hotel.profile._id, 'active', { title: { fr: 'Réceptionniste' } });

    const search = async (qs: string) => {
      const res = await get(`/jobs?${qs}`, cand.token);
      expect(res.status).toBe(200);
      return idsOf(res.body.data);
    };

    expect(await search('city=rabat')).toEqual([String(rabat._id)]);
    expect(await search('contractType=cdd')).toEqual([String(rabat._id)]);
    expect(await search('experience=3-5')).toEqual([String(rabat._id)]);
    expect(await search('sectorId=pastry')).toEqual([String(rabat._id)]);
    expect(await search('positionId=pastry-chef')).toEqual([String(rabat._id)]);
    expect(await search(`establishmentType=${otherType}`)).toEqual([String(atHotel._id)]);
    expect(await search('q=viennoiseries')).toEqual([String(rabat._id)]);
    expect(await search(`q=${encodeURIComponent('réceptionniste')}`)).toEqual([String(atHotel._id)]);
    expect(await search('')).toEqual(idsOf([base, rabat, atHotel].map((j) => ({ id: String(j._id) }))));

    expect((await get('/jobs?contractType=forever', cand.token)).status).toBe(422);
    expect((await get('/jobs?experience=99', cand.token)).status).toBe(422);
  });

  it('keeps guests on the first page and lets members page and widen results', async () => {
    const emp = await makeEmployer();
    for (let i = 0; i < 15; i += 1) await makeJob(emp.profile._id, 'active');
    const cand = await makeCandidate();

    const guest = await get('/jobs?limit=50');
    expect(guest.body.data).toHaveLength(12);
    expect(guest.body.meta.gated).toBe(true);
    expect((await get('/jobs?page=2')).status).toBe(401);

    const page2 = await get('/jobs?page=2', cand.token);
    expect(page2.status).toBe(200);
    expect(page2.body.data).toHaveLength(3);
    expect(page2.body.meta).toMatchObject({ page: 2, total: 15, totalPages: 2 });
    expect(page2.body.meta.gated).toBeUndefined();

    const wide = await get('/jobs?limit=500', cand.token);
    expect(wide.body.data).toHaveLength(15);
    expect(wide.body.meta.limit).toBe(100);
  });

  it('hides offers of blocked, suspended or deleted employers until they are restored', async () => {
    const blocked = await makeEmployer();
    const suspended = await makeEmployer();
    const removed = await makeEmployer();
    const visible = await makeEmployer();
    const blockedJob = await makeJob(blocked.profile._id, 'active');
    const suspendedJob = await makeJob(suspended.profile._id, 'active');
    await makeJob(removed.profile._id, 'active');
    const visibleJob = await makeJob(visible.profile._id, 'active');

    await EmployerProfile.updateOne({ _id: blocked.profile._id }, { status: 'blocked' });
    await User.updateOne({ _id: suspended.user._id }, { status: 'suspended' });
    await User.updateOne({ _id: removed.user._id }, { status: 'deleted', deletedAt: new Date() });

    const listed = await get('/jobs');
    expect(idsOf(listed.body.data)).toEqual([String(visibleJob._id)]);
    expect(listed.body.meta.total).toBe(1);
    expect(idsOf((await get('/jobs/featured')).body.data)).toEqual([String(visibleJob._id)]);

    expect((await get(`/jobs/${blockedJob._id}`)).status).toBe(404);
    expect((await get(`/jobs/${suspendedJob._id}`)).status).toBe(404);
    expect((await get(`/jobs/${blockedJob._id}`, blocked.token)).status).toBe(200);

    await EmployerProfile.updateOne({ _id: blocked.profile._id }, { status: 'active' });
    await User.updateOne({ _id: suspended.user._id }, { status: 'active' });

    expect((await get('/jobs')).body.meta.total).toBe(3);
    expect((await get(`/jobs/${blockedJob._id}`)).status).toBe(200);
  });
});

describe('GET /jobs/featured', () => {
  it('returns the newest active offers and honours the limit', async () => {
    const emp = await makeEmployer();
    const jobs = [];
    for (let i = 0; i < 8; i += 1) {
      jobs.push(await makeJob(emp.profile._id, 'active', { postedAt: new Date(Date.now() - i * DAY) }));
    }
    await makeJob(emp.profile._id, 'pending');

    const byDefault = await get('/jobs/featured');
    expect(byDefault.status).toBe(200);
    expect(byDefault.body.data.map((j: AnyDoc) => j.id)).toEqual(
      jobs.slice(0, 6).map((j) => String(j._id)),
    );
    expect((await get('/jobs/featured?limit=2')).body.data).toHaveLength(2);
    expect((await get('/jobs/featured?limit=25')).status).toBe(422);
  });
});

describe('GET /jobs/:id', () => {
  it('shows unpublished offers only to their owner and to admins', async () => {
    const owner = await makeEmployer();
    const other = await makeEmployer();
    const cand = await makeCandidate();
    const admin = await makeAdmin();

    for (const status of ['draft', 'pending', 'rejected']) {
      const job = await makeJob(owner.profile._id, status);
      const seen = {
        guest: (await get(`/jobs/${job._id}`)).status,
        candidate: (await get(`/jobs/${job._id}`, cand.token)).status,
        otherEmployer: (await get(`/jobs/${job._id}`, other.token)).status,
        owner: (await get(`/jobs/${job._id}`, owner.token)).status,
        admin: (await get(`/jobs/${job._id}`, admin.token)).status,
      };
      expect({ status, seen }).toEqual({
        status,
        seen: { guest: 404, candidate: 404, otherEmployer: 404, owner: 200, admin: 200 },
      });
    }

    for (const status of ['active', 'expired', 'closed']) {
      const job = await makeJob(owner.profile._id, status);
      const res = await get(`/jobs/${job._id}`);
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(status);
    }

    expect((await get(`/jobs/${new Types.ObjectId()}`)).status).toBe(404);
    expect((await get('/jobs/not-an-id')).status).toBe(422);
  });

  it('counts views from the public only', async () => {
    const owner = await makeEmployer();
    const cand = await makeCandidate();
    const admin = await makeAdmin();
    const job = await makeJob(owner.profile._id, 'active');

    await get(`/jobs/${job._id}`);
    await get(`/jobs/${job._id}`, cand.token);
    await get(`/jobs/${job._id}`, owner.token);
    await get(`/jobs/${job._id}`, admin.token);

    expect((await Job.findById(job._id)).viewCount).toBe(2);
  });
});

describe('employer offer management', () => {
  it('creates pending offers and drafts, and only approved employers may submit', async () => {
    const emp = await makeEmployer();
    const created = await post('/jobs', emp.token, {
      ...jobBody,
      salaryMin: 4000,
      salaryMax: 4000,
      requirements: ['haccp'],
      benefits: ['meals'],
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      status: 'pending',
      employerId: String(emp.profile._id),
      currency: 'MAD',
      country: 'MA',
      viewCount: 0,
      applicationCount: 0,
      requirements: ['haccp'],
      benefits: ['meals'],
      postedAt: null,
    });

    expect((await post('/jobs', emp.token, { ...jobBody, asDraft: true })).body.data.status).toBe('draft');

    const unapproved = await makeEmployer('pending');
    expect((await post('/jobs', unapproved.token, jobBody)).status).toBe(403);
    expect((await post('/jobs', unapproved.token, { ...jobBody, asDraft: true })).status).toBe(201);

    const cand = await makeCandidate();
    expect((await post('/jobs', cand.token, jobBody)).status).toBe(403);
  });

  it('validates offer bodies', async () => {
    const emp = await makeEmployer();
    const invalid: object[] = [
      { ...jobBody, title: { fr: '' } },
      { ...jobBody, title: undefined },
      { ...jobBody, description: { en: 'English only' } },
      { ...jobBody, contractType: 'forever' },
      { ...jobBody, experience: '100' },
      { ...jobBody, salaryMin: -1 },
      { ...jobBody, salaryMin: 1500.5 },
      { ...jobBody, salaryMin: '4000' },
      { ...jobBody, salaryMin: 7000, salaryMax: 5000 },
      { ...jobBody, requirements: 'haccp' },
    ];
    for (const body of invalid) {
      const res = await post('/jobs', emp.token, body);
      expect({ body, status: res.status }).toEqual({ body, status: 422 });
    }
    expect(await Job.countDocuments()).toBe(0);
  });

  it('edits offers: live offers go back to approval, salary order holds, strangers get 404', async () => {
    const owner = await makeEmployer();
    const other = await makeEmployer();
    const cand = await makeCandidate();
    const active = await makeJob(owner.profile._id, 'active', { salaryMin: 3000, salaryMax: 5000 });
    const pending = await makeJob(owner.profile._id, 'pending');
    const draft = await makeJob(owner.profile._id, 'draft');

    const editedPending = await patch(`/jobs/${pending._id}`, owner.token, { city: 'rabat' });
    expect(editedPending.body.data).toMatchObject({ status: 'pending', city: 'rabat' });

    const editedActive = await patch(`/jobs/${active._id}`, owner.token, { title: { fr: 'Chef exécutif' } });
    expect(editedActive.status).toBe(200);
    expect(editedActive.body.data).toMatchObject({
      status: 'pending',
      postedAt: null,
      expiresAt: null,
      approvedAt: null,
      title: { fr: 'Chef exécutif' },
    });

    expect((await patch(`/jobs/${draft._id}`, owner.token, { submit: true })).body.data.status).toBe('pending');

    expect((await patch(`/jobs/${pending._id}`, owner.token, { salaryMin: 9000, salaryMax: 8000 })).status).toBe(422);
    expect((await patch(`/jobs/${active._id}`, owner.token, { salaryMin: 6000 })).status).toBe(422);
    expect((await patch(`/jobs/${pending._id}`, other.token, { city: 'fes' })).status).toBe(404);
    expect((await patch(`/jobs/${pending._id}`, cand.token, { city: 'fes' })).status).toBe(403);
    expect((await patch(`/jobs/${pending._id}`, owner.token, { contractType: 'forever' })).status).toBe(422);
  });

  it('does not let a blocked employer send a live offer back for approval', async () => {
    const emp = await makeEmployer();
    const job = await makeJob(emp.profile._id, 'active');
    await EmployerProfile.updateOne({ _id: emp.profile._id }, { status: 'blocked' });

    expect((await patch(`/jobs/${job._id}`, emp.token, { city: 'rabat' })).status).toBe(403);
    expect((await Job.findById(job._id)).status).toBe('active');
  });

  it('closes live offers and republishes expired ones', async () => {
    const owner = await makeEmployer();
    const other = await makeEmployer();
    const active = await makeJob(owner.profile._id, 'active');
    const pending = await makeJob(owner.profile._id, 'pending');
    const expired = await makeJob(owner.profile._id, 'expired', {
      postedAt: new Date(Date.now() - 70 * DAY),
      expiresAt: new Date(Date.now() - 10 * DAY),
    });

    expect((await post(`/jobs/${active._id}/close`, other.token)).status).toBe(404);
    expect((await post(`/jobs/${active._id}/close`, owner.token)).body.data.status).toBe('closed');
    expect((await post(`/jobs/${active._id}/close`, owner.token)).status).toBe(409);
    expect((await post(`/jobs/${pending._id}/close`, owner.token)).status).toBe(409);

    const republished = await post(`/jobs/${expired._id}/republish`, owner.token);
    expect(republished.status).toBe(200);
    expect(republished.body.data).toMatchObject({
      status: 'pending',
      postedAt: null,
      expiresAt: null,
      extendedUntil: null,
    });
    expect(republished.body.data.republishedAt).toBeTruthy();
    expect((await post(`/jobs/${pending._id}/republish`, owner.token)).status).toBe(409);

    const expiredAgain = await makeJob(owner.profile._id, 'expired');
    await EmployerProfile.updateOne({ _id: owner.profile._id }, { status: 'blocked' });
    expect((await post(`/jobs/${expiredAgain._id}/republish`, owner.token)).status).toBe(403);
  });

  it("lists the employer's own offers grouped by status", async () => {
    const emp = await makeEmployer();
    const other = await makeEmployer();
    const statuses = ['active', 'pending', 'expired', 'draft', 'rejected', 'closed'];
    for (const status of statuses) await makeJob(emp.profile._id, status);
    const deleted = await makeJob(emp.profile._id, 'active');
    await deleted.softDelete();
    await makeJob(other.profile._id, 'active');

    const res = await get('/jobs/me/list', emp.token);
    expect(res.status).toBe(200);
    for (const status of statuses) {
      expect({ status, count: res.body.data[status].length }).toEqual({ status, count: 1 });
    }
  });

  it('records reports once per person and shows them to moderators', async () => {
    const emp = await makeEmployer();
    const cand = await makeCandidate();
    const admin = await makeAdmin();
    const job = await makeJob(emp.profile._id, 'active');
    const pending = await makeJob(emp.profile._id, 'pending');

    expect((await post(`/jobs/${job._id}/report`, undefined, { reason: 'Offre trompeuse' })).status).toBe(200);
    expect((await post(`/jobs/${job._id}/report`, cand.token, { reason: 'Salaire irréaliste' })).status).toBe(200);
    expect((await post(`/jobs/${job._id}/report`, cand.token, { reason: 'Encore une fois' })).status).toBe(200);

    expect((await Job.findById(job._id)).reportCount).toBe(2);
    expect(await Reports.countDocuments({ targetId: job._id })).toBe(2);

    expect((await post(`/jobs/${pending._id}/report`, cand.token, { reason: 'Pas publiée' })).status).toBe(404);
    expect((await post(`/jobs/${job._id}/report`, cand.token, { reason: 'no' })).status).toBe(422);
    expect((await post(`/jobs/${job._id}/report`, cand.token, { reason: 'x'.repeat(1001) })).status).toBe(422);

    const reports = await get('/admin/moderation/reports', admin.token);
    expect(reports.status).toBe(200);
    expect(reports.body.data).toHaveLength(2);
    expect(reports.body.data.every((r: AnyDoc) => r.targetId === String(job._id))).toBe(true);
  });
});

describe('applications', () => {
  it('requires a complete profile and an open offer from a visible employer', async () => {
    const emp = await makeEmployer();
    const complete = await makeCandidate();
    const incomplete = await makeCandidate({ availability: '' });
    const active = await makeJob(emp.profile._id, 'active');

    expect((await post('/applications', incomplete.token, { jobId: String(active._id) })).status).toBe(422);

    for (const status of ['pending', 'closed', 'expired', 'draft', 'rejected']) {
      const job = await makeJob(emp.profile._id, status);
      const res = await post('/applications', complete.token, { jobId: String(job._id) });
      expect({ status, code: res.status }).toEqual({ status, code: 404 });
    }
    expect((await post('/applications', complete.token, { jobId: String(new Types.ObjectId()) })).status).toBe(404);
    expect((await post('/applications', complete.token, { jobId: 'nope' })).status).toBe(422);
    expect((await post('/applications', emp.token, { jobId: String(active._id) })).status).toBe(403);

    const blocked = await makeEmployer();
    const blockedJob = await makeJob(blocked.profile._id, 'active');
    await EmployerProfile.updateOne({ _id: blocked.profile._id }, { status: 'blocked' });
    expect((await post('/applications', complete.token, { jobId: String(blockedJob._id) })).status).toBe(404);

    expect(await Application.countDocuments()).toBe(0);
  });

  it('submits once, counts the application and tells the employer', async () => {
    const emp = await makeEmployer();
    const cand = await makeCandidate();
    const job = await makeJob(emp.profile._id, 'active');

    const res = await post('/applications', cand.token, {
      jobId: String(job._id),
      coverNote: '  Disponible de suite  ',
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      jobId: String(job._id),
      candidateId: String(cand.profile._id),
      employerId: String(emp.profile._id),
      status: 'pending',
      coverNote: 'Disponible de suite',
    });
    expect(res.body.data.timeline).toHaveLength(1);

    expect((await post('/applications', cand.token, { jobId: String(job._id) })).status).toBe(409);
    expect((await Job.findById(job._id)).applicationCount).toBe(1);
    expect(await Notifications.countDocuments({ userId: emp.user._id, type: 'application' })).toBe(1);
  });

  it("lists a candidate's own applications with their offer", async () => {
    const emp = await makeEmployer();
    const cand = await makeCandidate();
    const other = await makeCandidate();
    const first = await makeJob(emp.profile._id, 'active', { title: { fr: 'Commis' } });
    const second = await makeJob(emp.profile._id, 'active', { title: { fr: 'Pâtissier' } });
    await post('/applications', cand.token, { jobId: String(first._id) });
    await post('/applications', cand.token, { jobId: String(second._id) });
    await post('/applications', other.token, { jobId: String(first._id) });

    const mine = await get('/applications/me', cand.token);
    expect(mine.status).toBe(200);
    expect(mine.body.data.map((a: AnyDoc) => a.jobId.title.fr).sort()).toEqual(['Commis', 'Pâtissier']);
    expect((await get('/applications/me', emp.token)).status).toBe(403);
  });

  it('shows employers only their received applications, with the applicant photo', async () => {
    const emp = await makeEmployer();
    const other = await makeEmployer();
    const cand = await makeCandidate();
    const job = await makeJob(emp.profile._id, 'active');
    const otherJob = await makeJob(other.profile._id, 'active');
    const applied = await post('/applications', cand.token, { jobId: String(job._id) });
    await post('/applications', cand.token, { jobId: String(otherJob._id) });
    await patch(`/applications/${applied.body.data.id}/status`, emp.token, { status: 'shortlisted' });

    const received = await get('/applications/received', emp.token);
    expect(received.status).toBe(200);
    expect(received.body.data).toHaveLength(1);
    const [row] = received.body.data;
    expect(row.jobId.id).toBe(String(job._id));
    expect(row.candidateId).toMatchObject({ id: String(cand.profile._id), photoUrl: cand.photo.url });
    expect(row.candidateId.phone).toBeUndefined();

    expect((await get('/applications/received?status=shortlisted', emp.token)).body.data).toHaveLength(1);
    expect((await get('/applications/received?status=hired', emp.token)).body.data).toHaveLength(0);
    expect((await get('/applications/received?status=bogus', emp.token)).status).toBe(422);
    expect((await get('/applications/received', cand.token)).status).toBe(403);
  });

  it('never shows employers an applicant photo that moderation rejected', async () => {
    const { MediaAsset } = await import('../src/modules/media/media.model');
    const emp = await makeEmployer();
    const cand = await makeCandidate();
    const job = await makeJob(emp.profile._id, 'active');
    await post('/applications', cand.token, { jobId: String(job._id) });
    await (MediaAsset as any).updateOne({ _id: cand.photo._id }, { moderationStatus: 'rejected' });

    const received = await get('/applications/received', emp.token);
    expect(received.status).toBe(200);
    expect(received.body.data[0].candidateId.photoUrl).toBeNull();
  });

  it('lets only the receiving employer change a status, once per change', async () => {
    const emp = await makeEmployer();
    const other = await makeEmployer();
    const cand = await makeCandidate();
    const job = await makeJob(emp.profile._id, 'active');
    const applied = await post('/applications', cand.token, { jobId: String(job._id) });
    const id = applied.body.data.id;

    const hired = await patch(`/applications/${id}/status`, emp.token, { status: 'hired', note: 'Bienvenue' });
    expect(hired.status).toBe(200);
    expect(hired.body.data.status).toBe('hired');
    expect(hired.body.data.timeline).toHaveLength(2);
    expect(hired.body.data.timeline[1]).toMatchObject({ status: 'hired', note: 'Bienvenue' });

    const repeated = await patch(`/applications/${id}/status`, emp.token, { status: 'hired' });
    expect(repeated.status).toBe(200);
    expect(repeated.body.data.timeline).toHaveLength(2);
    expect(await Notifications.countDocuments({ userId: cand.user._id })).toBe(1);

    expect((await patch(`/applications/${id}/status`, other.token, { status: 'rejected' })).status).toBe(404);
    expect((await patch(`/applications/${id}/status`, cand.token, { status: 'rejected' })).status).toBe(403);
    expect((await patch(`/applications/${id}/status`, emp.token, { status: 'archived' })).status).toBe(422);
    expect(
      (await patch(`/applications/${id}/status`, emp.token, { status: 'rejected', note: 'x'.repeat(501) })).status,
    ).toBe(422);
    expect(
      (await patch(`/applications/${new Types.ObjectId()}/status`, emp.token, { status: 'rejected' })).status,
    ).toBe(404);
  });
});

describe('admin offers', () => {
  it('lists offers with filters, search and pagination', async () => {
    const admin = await makeAdmin();
    const tajine = await makeEmployer();
    await EmployerProfile.updateOne({ _id: tajine.profile._id }, { name: 'Dar Tajine' });
    const other = await makeEmployer();
    const pending = await makeJob(tajine.profile._id, 'pending', { title: { fr: 'Serveur', ar: 'نادل' } });
    const activeRabat = await makeJob(other.profile._id, 'active', { city: 'rabat' });
    const deleted = await makeJob(other.profile._id, 'pending');
    await deleted.softDelete();
    for (let i = 0; i < 3; i += 1) await makeJob(other.profile._id, 'closed');

    const list = async (qs: string) => {
      const res = await get(`/admin/jobs?${qs}`, admin.token);
      expect(res.status).toBe(200);
      return res.body;
    };

    const all = await list('');
    expect(all.meta.total).toBe(5);
    expect(all.data[0].employer).toMatchObject({ id: expect.any(String), name: expect.any(String) });

    expect(idsOf((await list('status=pending')).data)).toEqual([String(pending._id)]);
    expect((await list(`employerId=${tajine.profile._id}`)).meta.total).toBe(1);
    expect(idsOf((await list('q=serveur')).data)).toEqual([String(pending._id)]);
    expect((await list(`q=${encodeURIComponent('نادل')}`)).meta.total).toBe(1);
    expect(idsOf((await list('q=tajine')).data)).toEqual([String(pending._id)]);
    expect(idsOf((await list('q=rabat')).data)).toEqual([String(activeRabat._id)]);
    expect((await list(`q=${encodeURIComponent('(')}`)).meta.total).toBe(0);

    const paged = await list('limit=2&page=2');
    expect(paged.data).toHaveLength(2);
    expect(paged.meta).toMatchObject({ page: 2, limit: 2, total: 5, totalPages: 3 });

    expect((await get('/admin/jobs?status=bogus', admin.token)).status).toBe(422);
  });

  it('summarises offers and applications per employer', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const other = await makeEmployer();
    const cand = await makeCandidate();
    const second = await makeCandidate();
    const active = await makeJob(emp.profile._id, 'active');
    const alsoActive = await makeJob(emp.profile._id, 'active');
    await makeJob(emp.profile._id, 'pending');
    await makeJob(other.profile._id, 'closed');

    await post('/applications', cand.token, { jobId: String(active._id) });
    await post('/applications', second.token, { jobId: String(active._id) });
    await post('/applications', cand.token, { jobId: String(alsoActive._id) });
    await alsoActive.softDelete();

    const res = await get('/admin/jobs/by-employer', admin.token);
    expect(res.status).toBe(200);
    const row = res.body.data.find((r: AnyDoc) => r.employerId === String(emp.profile._id));
    expect(row).toEqual({
      employerId: String(emp.profile._id),
      employer: { id: String(emp.profile._id), name: 'Chez Fixtures', city: 'casablanca', logoUrl: null },
      counts: { active: 1, pending: 1 },
      total: 2,
      applications: 2,
    });
    const otherRow = res.body.data.find((r: AnyDoc) => r.employerId === String(other.profile._id));
    expect(otherRow).toMatchObject({ counts: { closed: 1 }, total: 1, applications: 0 });
  });

  it('reads one offer with its employer, and 404s deleted or missing ones', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const job = await makeJob(emp.profile._id, 'draft');

    const res = await get(`/admin/jobs/${job._id}`, admin.token);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: String(job._id),
      status: 'draft',
      employer: { id: String(emp.profile._id) },
    });

    await job.softDelete();
    expect((await get(`/admin/jobs/${job._id}`, admin.token)).status).toBe(404);
    expect((await get(`/admin/jobs/${new Types.ObjectId()}`, admin.token)).status).toBe(404);
  });

  it('edits offer content without changing its status', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const job = await makeJob(emp.profile._id, 'active', { salaryMin: 3000, salaryMax: 4000 });

    const res = await patch(`/admin/jobs/${job._id}`, admin.token, {
      title: { fr: 'Chef pâtissier', en: 'Pastry chef' },
      salaryMax: 5000,
      city: 'fes',
      requirements: ['haccp'],
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      status: 'active',
      city: 'fes',
      salaryMax: 5000,
      requirements: ['haccp'],
      title: { fr: 'Chef pâtissier', en: 'Pastry chef' },
    });
    expect(await Activity.countDocuments({ action: 'job.updated' })).toBe(1);

    expect((await patch(`/admin/jobs/${job._id}`, admin.token, { salaryMin: 6000 })).status).toBe(422);
    expect((await patch(`/admin/jobs/${job._id}`, admin.token, { title: { fr: '' } })).status).toBe(422);
  });

  it('approves, rejects and closes offers through decisions', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const pending = await makeJob(emp.profile._id, 'pending');
    const toReject = await makeJob(emp.profile._id, 'pending');
    const active = await makeJob(emp.profile._id, 'active');

    const approved = await patch(`/admin/jobs/${pending._id}/decision`, admin.token, { status: 'active' });
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({
      status: 'active',
      approvedBy: String(admin.user._id),
      rejectionReason: null,
      employer: { id: String(emp.profile._id) },
    });
    const window = new Date(approved.body.data.expiresAt).getTime() - new Date(approved.body.data.postedAt).getTime();
    expect(Math.round(window / DAY)).toBe(60);
    expect((await patch(`/admin/jobs/${pending._id}/decision`, admin.token, { status: 'active' })).status).toBe(409);

    expect((await patch(`/admin/jobs/${toReject._id}/decision`, admin.token, { status: 'rejected' })).status).toBe(422);
    expect((await Job.findById(toReject._id)).status).toBe('pending');

    const rejected = await patch(`/admin/jobs/${toReject._id}/decision`, admin.token, {
      status: 'rejected',
      rejectionReason: ' Salaire manquant ',
    });
    expect(rejected.body.data).toMatchObject({ status: 'rejected', rejectionReason: 'Salaire manquant' });
    expect((await patch(`/admin/jobs/${toReject._id}/decision`, admin.token, { status: 'active' })).status).toBe(409);

    expect((await patch(`/admin/jobs/${active._id}/decision`, admin.token, { status: 'closed' })).body.data.status).toBe('closed');
    expect((await patch(`/admin/jobs/${active._id}/decision`, admin.token, { status: 'expired' })).status).toBe(422);

    expect(await Notifications.countDocuments({ userId: emp.user._id, type: 'job' })).toBe(3);
    expect(
      await Activity.countDocuments({ action: { $in: ['job.approved', 'job.rejected', 'job.closed'] } }),
    ).toBe(3);
  });

  it('republishes an expired offer on approval, but never for an unapproved or blocked employer', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const expired = await makeJob(emp.profile._id, 'expired', {
      postedAt: new Date(Date.now() - 70 * DAY),
      expiresAt: new Date(Date.now() - 10 * DAY),
      extendedUntil: new Date(Date.now() - 5 * DAY),
    });

    const approved = await patch(`/admin/jobs/${expired._id}/decision`, admin.token, { status: 'active' });
    expect(approved.status).toBe(200);
    expect(approved.body.data).toMatchObject({ status: 'active', extendedUntil: null });
    expect(new Date(approved.body.data.expiresAt).getTime()).toBeGreaterThan(Date.now());

    for (const status of ['pending', 'blocked', 'rejected']) {
      const employer = await makeEmployer(status);
      const job = await makeJob(employer.profile._id, 'pending');
      const res = await patch(`/admin/jobs/${job._id}/decision`, admin.token, { status: 'active' });
      expect({ status, code: res.status }).toEqual({ status, code: 409 });
      expect((await Job.findById(job._id)).status).toBe('pending');
    }
  });

  it('closes, republishes and deletes offers, keeping applications readable', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const cand = await makeCandidate();
    const active = await makeJob(emp.profile._id, 'active');
    const expired = await makeJob(emp.profile._id, 'expired');
    const pending = await makeJob(emp.profile._id, 'pending');

    expect((await post(`/admin/jobs/${active._id}/close`, admin.token)).body.data.status).toBe('closed');
    expect(await Notifications.countDocuments({ userId: emp.user._id, type: 'job' })).toBe(1);
    expect((await post(`/admin/jobs/${pending._id}/close`, admin.token)).status).toBe(409);

    const republished = await post(`/admin/jobs/${expired._id}/republish`, admin.token);
    expect(republished.body.data).toMatchObject({ status: 'pending', postedAt: null });
    expect((await post(`/admin/jobs/${pending._id}/republish`, admin.token)).status).toBe(409);

    const live = await makeJob(emp.profile._id, 'active');
    expect((await post('/applications', cand.token, { jobId: String(live._id) })).status).toBe(201);

    const removed = await del(`/admin/jobs/${live._id}`, admin.token);
    expect(removed.status).toBe(200);
    expect(removed.body.data.deletedAt).toBeTruthy();
    expect((await del(`/admin/jobs/${live._id}`, admin.token)).status).toBe(404);

    expect((await get(`/jobs/${live._id}`)).status).toBe(404);
    expect((await get('/jobs')).body.data).toHaveLength(0);

    const mine = await get('/applications/me', cand.token);
    expect(mine.status).toBe(200);
    expect(mine.body.data[0].jobId).toBeNull();
    const received = await get('/applications/received', emp.token);
    expect(received.status).toBe(200);
    expect(received.body.data[0].jobId).toBeNull();

    expect(await Activity.countDocuments({ action: 'job.deleted' })).toBe(1);
  });

  it('extends offers only beyond their current expiry', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const active = await makeJob(emp.profile._id, 'active');
    const expired = await makeJob(emp.profile._id, 'expired', {
      postedAt: new Date(Date.now() - 70 * DAY),
      expiresAt: new Date(Date.now() - 10 * DAY),
    });
    const pending = await makeJob(emp.profile._id, 'pending');

    expect((await patch(`/admin/jobs/${active._id}/extend`, admin.token, { extendedUntil: inDays(30) })).status).toBe(422);

    const until = inDays(90);
    const extended = await patch(`/admin/jobs/${active._id}/extend`, admin.token, { extendedUntil: until });
    expect(extended.status).toBe(200);
    expect(extended.body.data.status).toBe('active');
    expect(new Date(extended.body.data.extendedUntil).toISOString()).toBe(until);
    expect((await patch(`/admin/jobs/${active._id}/extend`, admin.token, { extendedUntil: inDays(80) })).status).toBe(422);

    const revived = await patch(`/admin/jobs/${expired._id}/extend`, admin.token, { extendedUntil: inDays(15) });
    expect(revived.body.data.status).toBe('active');

    expect((await patch(`/admin/jobs/${pending._id}/extend`, admin.token, { extendedUntil: inDays(15) })).status).toBe(409);
    expect((await patch(`/admin/jobs/${active._id}/extend`, admin.token, { extendedUntil: 'not-a-date' })).status).toBe(422);

    const blocked = await makeEmployer('blocked');
    const blockedExpired = await makeJob(blocked.profile._id, 'expired', { expiresAt: new Date(Date.now() - DAY) });
    expect((await patch(`/admin/jobs/${blockedExpired._id}/extend`, admin.token, { extendedUntil: inDays(15) })).status).toBe(409);

    expect(await Activity.countDocuments({ action: 'job.extended' })).toBe(2);
  });

  it('expires offers past their effective expiry', async () => {
    const emp = await makeEmployer();
    const due = await makeJob(emp.profile._id, 'active', { expiresAt: new Date(Date.now() - DAY) });
    const extended = await makeJob(emp.profile._id, 'active', {
      expiresAt: new Date(Date.now() - DAY),
      extendedUntil: new Date(Date.now() + DAY),
    });
    const fresh = await makeJob(emp.profile._id, 'active');

    expect(await expireOffers()).toBe(1);
    expect((await Job.findById(due._id)).status).toBe('expired');
    expect((await Job.findById(extended._id)).status).toBe('active');
    expect((await Job.findById(fresh._id)).status).toBe('active');
  });

  it('requires the approve-offers permission', async () => {
    const offersAdmin = await makeAdmin(['approve-offers'], 'sub');
    const photosAdmin = await makeAdmin(['approve-photos'], 'sub');

    expect((await get('/admin/jobs', offersAdmin.token)).status).toBe(200);
    expect((await get('/admin/jobs/by-employer', offersAdmin.token)).status).toBe(200);
    expect((await get('/admin/jobs', photosAdmin.token)).status).toBe(403);
  });
});
