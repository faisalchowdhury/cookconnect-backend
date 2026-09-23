import request from 'supertest';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { ALL_ADMIN_PERMISSIONS } from '../src/modules/user/user.constant';
import { User } from '../src/modules/user/user.model';
import { CandidateProfile } from '../src/modules/candidate/candidate.model';
import { EmployerProfile } from '../src/modules/employer/employer.model';
import { Job } from '../src/modules/job/job.model';
import { Notification as NotificationModel } from '../src/modules/notification/notification.model';
import { Taxonomy } from '../src/modules/taxonomy/taxonomy.model';
import { MediaAsset } from '../src/modules/media/media.model';
import { ActivityLog } from '../src/modules/activityLog/activityLog.model';
import { Banner } from '../src/modules/banner/banner.model';
import { BANNER_PLACEMENTS } from '../src/modules/banner/banner.constant';
import * as taxonomyService from '../src/modules/taxonomy/taxonomy.service';

const app = createApp();
const Notification = NotificationModel as any;
const API = '/api/v1';

type AnyDoc = any;

function tokenFor(user: AnyDoc): string {
  return jwt.sign(
    {
      userId: String(user._id),
      role: user.role,
      permissions: user.permissions ?? [],
      adminLevel: user.adminLevel ?? null,
      email: user.email,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: '15m' },
  );
}

let seq = 0;
async function makeUser(role: string, extra: Record<string, unknown> = {}): Promise<AnyDoc> {
  seq += 1;
  return User.create({
    email: `${role}${seq}@flows.test`,
    passwordHash: 'not-used',
    role,
    status: 'active',
    emailVerified: true,
    ...extra,
  });
}

async function makeAdmin(
  permissions: string[] = [...ALL_ADMIN_PERMISSIONS],
  adminLevel: 'super' | 'sub' = 'super',
) {
  const user = await makeUser('admin', { adminLevel, permissions });
  return { user, token: tokenFor(user) };
}

async function makeMedia(ownerUserId: Types.ObjectId, kind: string, extra: Record<string, unknown> = {}) {
  return MediaAsset.create({
    ownerUserId,
    kind,
    storageKey: `${kind}/${ownerUserId}-${seq}.jpg`,
    url: `/uploads/${kind}/${ownerUserId}-${seq}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    ...extra,
  });
}

async function makeEmployer(status = 'active') {
  const user = await makeUser('employer');
  const profile = await EmployerProfile.create({
    userId: user._id,
    name: 'Chez Flows',
    type: 'restaurant',
    city: 'casablanca',
    status,
    verified: status === 'active',
  });
  return { user, profile, token: tokenFor(user) };
}

async function makeCandidate(overrides: Record<string, unknown> = {}) {
  const user = await makeUser('candidate');
  const photo = await makeMedia(user._id, 'profile-photo');
  const profile = await CandidateProfile.create({
    userId: user._id,
    firstName: 'Amina',
    lastName: 'Flows',
    phone: '0612345678',
    city: 'casablanca',
    sectorId: 'kitchen',
    positionId: 'head-chef',
    experience: '1-3',
    availability: 'immediate',
    photoId: photo._id,
    searchable: true,
    ...overrides,
  });
  return { user, profile, photo, token: tokenFor(user) };
}

const jobBody = {
  title: { fr: 'Chef de partie' },
  description: { fr: 'Cuisine marocaine traditionnelle' },
  sectorId: 'kitchen',
  positionId: 'head-chef',
  city: 'casablanca',
  contractType: 'cdi',
  experience: '1-3',
};

async function makeJob(employerId: Types.ObjectId, status = 'active', extra: Record<string, unknown> = {}) {
  const now = new Date();
  return Job.create({
    employerId,
    ...jobBody,
    status,
    postedAt: status === 'active' ? now : null,
    expiresAt: status === 'active' ? new Date(now.getTime() + 60 * 86_400_000) : null,
    ...extra,
  });
}

beforeEach(async () => {
  await Taxonomy.create([
    { type: 'sector', key: 'kitchen', label: { fr: 'Cuisine', ar: 'مطبخ', en: 'Kitchen' } },
    {
      type: 'position',
      key: 'head-chef',
      parentKey: 'kitchen',
      label: { fr: 'Chef', ar: 'شيف', en: 'Chef' },
      meta: { allowsFoodPhotos: true },
    },
  ]);
  await taxonomyService.loadCache();
});

describe('registration and defaults', () => {
  it('creates the role profile for new candidates and employers', async () => {
    for (const role of ['candidate', 'employer']) {
      const email = `new-${role}@flows.test`;
      const res = await request(app)
        .post(`${API}/auth/register`)
        .send({ email, password: 'Password1!', role, locale: 'fr' });
      expect(res.status).toBe(201);

      const user = await User.findOne({ email });
      const Model = role === 'candidate' ? CandidateProfile : EmployerProfile;
      expect(await Model.exists({ userId: user._id })).toBeTruthy();
    }
  });

  it('accepts banners without a subtitle or call to action', async () => {
    const banner = await Banner.create({
      placement: BANNER_PLACEMENTS[0],
      title: { fr: 'Recrutement' },
      href: '/allJobs',
    });
    expect(banner.subtitle.fr).toBe('');
  });
});

describe('offers', () => {
  it('public job detail hides offers that are not published, except to their owner', async () => {
    const emp = await makeEmployer();
    const pending = await makeJob(emp.profile._id, 'pending');
    const active = await makeJob(emp.profile._id, 'active');

    const guestPending = await request(app).get(`${API}/jobs/${pending._id}`);
    expect(guestPending.status).toBe(404);

    const ownerPending = await request(app)
      .get(`${API}/jobs/${pending._id}`)
      .set('Authorization', `Bearer ${emp.token}`);
    expect(ownerPending.status).toBe(200);

    const guestActive = await request(app).get(`${API}/jobs/${active._id}`);
    expect(guestActive.status).toBe(200);

    const missing = await request(app).get(`${API}/jobs/${new Types.ObjectId()}`);
    expect(missing.status).toBe(404);

    const unpublished = await Job.findById(pending._id);
    expect(unpublished.viewCount).toBe(0);
  });

  it('employers must be approved before publishing offers', async () => {
    for (const status of ['pending', 'blocked', 'rejected']) {
      const emp = await makeEmployer(status);
      const res = await request(app)
        .post(`${API}/jobs`)
        .set('Authorization', `Bearer ${emp.token}`)
        .send(jobBody);
      expect(res.status).toBe(403);
    }

    const approved = await makeEmployer('active');
    const ok = await request(app)
      .post(`${API}/jobs`)
      .set('Authorization', `Bearer ${approved.token}`)
      .send(jobBody);
    expect(ok.status).toBe(201);
    expect(ok.body.data.status).toBe('pending');
  });

  it('approving and rejecting an offer notifies the employer', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const toApprove = await makeJob(emp.profile._id, 'pending');
    const toReject = await makeJob(emp.profile._id, 'pending');

    const approved = await request(app)
      .patch(`${API}/admin/jobs/${toApprove._id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'active' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.status).toBe('active');
    expect(approved.body.data.postedAt).toBeTruthy();
    expect(approved.body.data.expiresAt).toBeTruthy();

    const rejected = await request(app)
      .patch(`${API}/admin/jobs/${toReject._id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'rejected', rejectionReason: 'Salaire manquant' });
    expect(rejected.status).toBe(200);

    const notes = await Notification.find({ userId: emp.user._id }).sort({ createdAt: 1 });
    expect(notes).toHaveLength(2);
    expect(notes.every((n: AnyDoc) => n.type === 'job')).toBe(true);
    expect(String(notes[0].data.jobId)).toBe(String(toApprove._id));
    expect(JSON.stringify(notes[1].body)).toContain('Salaire manquant');
  });

  it('search totals respect the text query and ignore deleted offers', async () => {
    const emp = await makeEmployer();
    const cand = await makeCandidate();
    await makeJob(emp.profile._id, 'active');
    await makeJob(emp.profile._id, 'active', { title: { fr: 'Serveur' } });
    const deleted = await makeJob(emp.profile._id, 'active', { title: { fr: 'Serveur' } });
    await deleted.softDelete();

    const res = await request(app)
      .get(`${API}/jobs?q=Serveur`)
      .set('Authorization', `Bearer ${cand.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.meta.total).toBe(1);

    const unbalanced = await request(app)
      .get(`${API}/jobs?q=${encodeURIComponent('(')}`)
      .set('Authorization', `Bearer ${cand.token}`);
    expect(unbalanced.status).toBe(200);
  });

  it('guests cannot widen the first page beyond the page size', async () => {
    const emp = await makeEmployer();
    for (let i = 0; i < 13; i += 1) {
      await makeJob(emp.profile._id, 'active');
    }

    const res = await request(app).get(`${API}/jobs?limit=100`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(12);
    expect(res.body.meta.gated).toBe(true);
  });

  it('extension dates must be in the future', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const job = await makeJob(emp.profile._id, 'active');

    const past = new Date(Date.now() - 86_400_000).toISOString();
    const res = await request(app)
      .patch(`${API}/admin/jobs/${job._id}/extend`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ extendedUntil: past });
    expect(res.status).toBe(422);
  });

  it('deleting an offer is recorded in the activity log', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const job = await makeJob(emp.profile._id, 'active');

    const res = await request(app)
      .delete(`${API}/admin/jobs/${job._id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);

    const entry = await ActivityLog.findOne({ action: 'job.deleted' });
    expect(entry).toBeTruthy();
    expect(String(entry.actorUserId)).toBe(String(admin.user._id));
  });
});

describe('candidates, employers and applications', () => {
  it('completing a profile in one PATCH makes it searchable immediately', async () => {
    const cand = await makeCandidate({ availability: '', searchable: false });
    expect(cand.profile.completionPercent).toBeLessThan(100);

    const res = await request(app)
      .patch(`${API}/candidates/me`)
      .set('Authorization', `Bearer ${cand.token}`)
      .send({ availability: 'immediate' });
    expect(res.status).toBe(200);
    expect(res.body.data.completionPercent).toBe(100);
    expect(res.body.data.searchable).toBe(true);
  });

  it('a candidate sees their own photos, including ones awaiting moderation', async () => {
    const cand = await makeCandidate();
    const dish = await makeMedia(cand.user._id, 'dish-photo');
    await CandidateProfile.updateOne({ _id: cand.profile._id }, { foodPhotoIds: [dish._id] });

    const me = await request(app)
      .get(`${API}/candidates/me`)
      .set('Authorization', `Bearer ${cand.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.photoUrl).toBe(cand.photo.url);
    expect(me.body.data.photoModerationStatus).toBe('pending');
    expect(me.body.data.dishPhotos).toEqual([
      { id: String(dish._id), url: dish.url, moderationStatus: 'pending' },
    ]);

    const patched = await request(app)
      .patch(`${API}/candidates/me`)
      .set('Authorization', `Bearer ${cand.token}`)
      .send({ firstName: 'Nadia' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.photoUrl).toBe(cand.photo.url);
    expect(patched.body.data.dishPhotos).toHaveLength(1);
  });

  it('an employer sees their own logo and cover', async () => {
    const emp = await makeEmployer();
    const logo = await makeMedia(emp.user._id, 'logo');
    await EmployerProfile.updateOne({ _id: emp.profile._id }, { logoId: logo._id });

    const me = await request(app)
      .get(`${API}/employers/me`)
      .set('Authorization', `Bearer ${emp.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.logoUrl).toBe(logo.url);
    expect(me.body.data.coverUrl).toBeNull();

    const patched = await request(app)
      .patch(`${API}/employers/me`)
      .set('Authorization', `Bearer ${emp.token}`)
      .send({ name: 'La Table Flows' });
    expect(patched.status).toBe(200);
    expect(patched.body.data.logoUrl).toBe(logo.url);
  });

  it('admin skill edits do not corrupt profile completion', async () => {
    const admin = await makeAdmin();
    const cand = await makeCandidate();
    expect(cand.profile.completionPercent).toBe(100);

    const added = await request(app)
      .post(`${API}/admin/candidates/${cand.profile._id}/skills`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ skillId: 'haccp' });
    expect(added.status).toBe(200);

    const removed = await request(app)
      .delete(`${API}/admin/candidates/${cand.profile._id}/skills/haccp`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(removed.status).toBe(200);

    const reloaded = await CandidateProfile.findById(cand.profile._id);
    expect(reloaded.completionPercent).toBe(100);
  });

  it('applying notifies the employer, status changes notify the candidate, duplicates are refused', async () => {
    const emp = await makeEmployer();
    const cand = await makeCandidate();
    const job = await makeJob(emp.profile._id, 'active');

    const applied = await request(app)
      .post(`${API}/applications`)
      .set('Authorization', `Bearer ${cand.token}`)
      .send({ jobId: String(job._id) });
    expect(applied.status).toBe(201);

    const duplicate = await request(app)
      .post(`${API}/applications`)
      .set('Authorization', `Bearer ${cand.token}`)
      .send({ jobId: String(job._id) });
    expect(duplicate.status).toBe(409);

    const employerNotes = await Notification.find({ userId: emp.user._id });
    expect(employerNotes).toHaveLength(1);
    expect(employerNotes[0].type).toBe('application');

    const received = await request(app)
      .get(`${API}/applications/received`)
      .set('Authorization', `Bearer ${emp.token}`);
    expect(received.status).toBe(200);
    expect(received.body.data).toHaveLength(1);
    expect(received.body.data[0].candidateId.phone).toBeUndefined();

    const shortlisted = await request(app)
      .patch(`${API}/applications/${received.body.data[0].id}/status`)
      .set('Authorization', `Bearer ${emp.token}`)
      .send({ status: 'shortlisted' });
    expect(shortlisted.status).toBe(200);

    const mine = await request(app)
      .get(`${API}/applications/me`)
      .set('Authorization', `Bearer ${cand.token}`);
    expect(mine.body.data[0].status).toBe('shortlisted');

    const candidateNotes = await Notification.find({ userId: cand.user._id });
    expect(candidateNotes).toHaveLength(1);
    expect(candidateNotes[0].data.status).toBe('shortlisted');
  });

  it('guests never receive candidate phone numbers', async () => {
    const cand = await makeCandidate();

    const list = await request(app).get(`${API}/candidates`);
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBeGreaterThan(0);
    expect(list.body.data[0].phone).toBeUndefined();

    const detail = await request(app).get(`${API}/candidates/${cand.profile._id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.phone).toBeUndefined();
  });

  it('bookmarks refuse targets that do not exist', async () => {
    const cand = await makeCandidate();
    const emp = await makeEmployer();

    const job = await request(app)
      .post(`${API}/bookmarks/jobs`)
      .set('Authorization', `Bearer ${cand.token}`)
      .send({ targetId: String(new Types.ObjectId()) });
    expect(job.status).toBe(404);

    const profile = await request(app)
      .post(`${API}/bookmarks/profiles`)
      .set('Authorization', `Bearer ${emp.token}`)
      .send({ targetId: String(new Types.ObjectId()) });
    expect(profile.status).toBe(404);
  });
});

describe('admin decisions', () => {
  it('establishment approval, rejection and blocking notify the employer', async () => {
    const admin = await makeAdmin();
    const approvedEmp = await makeEmployer('pending');
    const rejectedEmp = await makeEmployer('pending');

    const approve = await request(app)
      .patch(`${API}/admin/employers/${approvedEmp.profile._id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'active' });
    expect(approve.status).toBe(200);

    const reject = await request(app)
      .patch(`${API}/admin/employers/${rejectedEmp.profile._id}/decision`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'rejected', rejectionReason: 'Registre de commerce illisible' });
    expect(reject.status).toBe(200);

    const block = await request(app)
      .patch(`${API}/admin/employers/${approvedEmp.profile._id}/block`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ blocked: true, reason: 'Collecte abusive de contacts' });
    expect(block.status).toBe(200);

    expect(await Notification.countDocuments({ userId: approvedEmp.user._id })).toBe(2);
    const rejection = await Notification.findOne({ userId: rejectedEmp.user._id });
    expect(JSON.stringify(rejection.body)).toContain('Registre de commerce illisible');
  });

  it('verifying a candidate notifies them', async () => {
    const admin = await makeAdmin();
    const cand = await makeCandidate();

    const res = await request(app)
      .patch(`${API}/admin/candidates/${cand.profile._id}/verification`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ verified: true });
    expect(res.status).toBe(200);

    const notes = await Notification.find({ userId: cand.user._id });
    expect(notes).toHaveLength(1);
    expect(notes[0].type).toBe('approval');
  });

  it('rejecting a photo tells its owner why', async () => {
    const admin = await makeAdmin();
    const cand = await makeCandidate();

    const res = await request(app)
      .patch(`${API}/admin/moderation/photos/${cand.photo._id}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ status: 'rejected', reason: 'Visage non visible' });
    expect(res.status).toBe(200);

    const note = await Notification.findOne({ userId: cand.user._id });
    expect(note).toBeTruthy();
    expect(JSON.stringify(note.body)).toContain('Visage non visible');
  });

  it('sub-admins only reach the sections their permissions allow', async () => {
    const moderator = await makeAdmin(['approve-photos'], 'sub');
    const emp = await makeEmployer();
    const job = await makeJob(emp.profile._id, 'pending');

    const photos = await request(app)
      .get(`${API}/admin/moderation/photos`)
      .set('Authorization', `Bearer ${moderator.token}`);
    expect(photos.status).toBe(200);

    const candidates = await request(app)
      .get(`${API}/admin/candidates`)
      .set('Authorization', `Bearer ${moderator.token}`);
    expect(candidates.status).toBe(403);

    const decision = await request(app)
      .patch(`${API}/admin/jobs/${job._id}/decision`)
      .set('Authorization', `Bearer ${moderator.token}`)
      .send({ status: 'active' });
    expect(decision.status).toBe(403);
  });

  it('admin account creation and candidate deletion record the acting admin', async () => {
    const admin = await makeAdmin();
    const cand = await makeCandidate();

    const created = await request(app)
      .post(`${API}/admin/admins`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ email: 'sub@flows.test', password: 'Password1!', permissions: ['approve-photos'] });
    expect(created.status).toBe(201);

    const deleted = await request(app)
      .delete(`${API}/admin/candidates/${cand.profile._id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(deleted.status).toBe(200);

    const createdLog = await ActivityLog.findOne({ action: 'admin.created' });
    expect(String(createdLog.actorUserId)).toBe(String(admin.user._id));

    const deletedLog = await ActivityLog.findOne({ action: 'candidate.deleted' });
    expect(deletedLog).toBeTruthy();
    expect(String(deletedLog.actorUserId)).toBe(String(admin.user._id));
  });

  it('CSV export applies the dashboard filters and only includes phones on request', async () => {
    const admin = await makeAdmin();
    await makeCandidate({ city: 'casablanca' });
    await makeCandidate({ city: 'rabat', phone: '0699999999' });

    const filtered = await request(app)
      .get(`${API}/admin/candidates/export?city=rabat`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(filtered.status).toBe(200);
    const lines = filtered.text.replace(/^﻿/, '').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(filtered.text).not.toContain('0699999999');

    const withContact = await request(app)
      .get(`${API}/admin/candidates/export?city=rabat&withContact=true`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(withContact.text).toContain('0699999999');
    expect(await ActivityLog.countDocuments({ action: 'contact.exported' })).toBe(1);
  });
});
