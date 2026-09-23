import fs from 'fs';
import path from 'path';
import request from 'supertest';
import sharp from 'sharp';
import { Types } from 'mongoose';
import { createApp } from '../src/app';
import { env } from '../src/config/env';
import { ActivityLog } from '../src/modules/activityLog/activityLog.model';
import { CandidateProfile } from '../src/modules/candidate/candidate.model';
import { EmployerProfile } from '../src/modules/employer/employer.model';
import { MediaAsset } from '../src/modules/media/media.model';
import { ModerationReport } from '../src/modules/media/moderationReport.model';
import { Notification } from '../src/modules/notification/notification.model';
import { Taxonomy } from '../src/modules/taxonomy/taxonomy.model';
import * as taxonomyService from '../src/modules/taxonomy/taxonomy.service';
import { User } from '../src/modules/user/user.model';
import {
  API,
  makeAdmin,
  makeCandidate,
  makeEmployer,
  makeJob,
  makeMedia,
  seedTaxonomy,
} from './helpers/fixtures';

const app = createApp();
const Notifications = Notification as any;
const Logs = ActivityLog as any;

const bearer = (token?: string) => (token ? { Authorization: `Bearer ${token}` } : {});
const get = (url: string, token?: string) => request(app).get(`${API}${url}`).set(bearer(token));
const del = (url: string, token?: string) =>
  request(app).delete(`${API}${url}`).set(bearer(token));
const patch = (url: string, token: string | undefined, body: object) =>
  request(app).patch(`${API}${url}`).set(bearer(token)).send(body);
const post = (url: string, token: string | undefined, body: object = {}) =>
  request(app).post(`${API}${url}`).set(bearer(token)).send(body);

type FileSpec = { buffer: Buffer; name: string; type: string };

function upload(url: string, token: string | undefined, field: string, files: FileSpec[]) {
  const req = request(app).post(`${API}${url}`).set(bearer(token));
  for (const file of files) {
    req.attach(field, file.buffer, { filename: file.name, contentType: file.type });
  }
  return req;
}

const uploadRoot = path.resolve(process.cwd(), env.UPLOAD_DIR);
const writtenDirs = new Set<string>();

function track(...urls: unknown[]) {
  for (const url of urls) {
    if (typeof url === 'string' && url.startsWith('/uploads/')) {
      writtenDirs.add(path.dirname(path.join(uploadRoot, url.slice('/uploads/'.length))));
    }
  }
}

let jpeg: Buffer;
let png: Buffer;
let tiny: Buffer;
const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const docx = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(64, 1)]);
const photo = (name = 'photo.jpg'): FileSpec => ({ buffer: jpeg, name, type: 'image/jpeg' });

beforeAll(async () => {
  jpeg = await sharp({ create: { width: 700, height: 700, channels: 3, background: '#aa3322' } })
    .jpeg()
    .toBuffer();
  png = await sharp({ create: { width: 640, height: 640, channels: 3, background: '#22aa33' } })
    .png()
    .toBuffer();
  tiny = await sharp({ create: { width: 100, height: 100, channels: 3, background: '#000000' } })
    .jpeg()
    .toBuffer();
});

afterAll(() => {
  writtenDirs.forEach((dir) => fs.rmSync(dir, { recursive: true, force: true }));
});

beforeEach(async () => {
  await seedTaxonomy();
  await Taxonomy.create([
    { type: 'sector', key: 'service', label: { fr: 'Service' } },
    { type: 'position', key: 'waiter', parentKey: 'service', label: { fr: 'Serveur' }, meta: {} },
  ]);
  await taxonomyService.loadCache();
});

const idOf = (doc: any) => String(doc._id);
const rawProfile = (id: unknown) => CandidateProfile.collection.findOne({ _id: id as any });
const rawAsset = (id: unknown) => MediaAsset.collection.findOne({ _id: id as any });
const anyUser = (id: unknown) => User.findOne({ _id: id }).setOptions({ includeDeleted: true });

describe('GET /candidates — search', () => {
  it('gives guests one page of twelve, without contact details', async () => {
    for (let i = 0; i < 13; i += 1) await makeCandidate();
    const emp = await makeEmployer();

    const guest = await get('/candidates?limit=100');
    expect(guest.status).toBe(200);
    expect(guest.body.data).toHaveLength(12);
    expect(guest.body.meta).toMatchObject({ total: 13, gated: true });
    expect(guest.body.data.every((c: any) => c.phone === undefined)).toBe(true);
    expect(typeof guest.body.data[0].photoUrl).toBe('string');

    expect((await get('/candidates?page=2')).status).toBe(401);

    const signedIn = await get('/candidates?page=2&limit=5', emp.token);
    expect(signedIn.status).toBe(200);
    expect(signedIn.body.data).toHaveLength(5);
    expect(signedIn.body.meta.page).toBe(2);
    expect(signedIn.body.meta.gated).toBeUndefined();
  });

  it('filters and searches with totals that match the rows', async () => {
    const emp = await makeEmployer();
    await makeCandidate({ city: 'rabat', firstName: 'Karim' });
    await makeCandidate({ city: 'rabat', experience: '5-10' });
    await makeCandidate({ city: 'casablanca' });

    const rabat = await get('/candidates?city=rabat', emp.token);
    expect(rabat.body.meta.total).toBe(2);
    expect(rabat.body.data).toHaveLength(2);

    const senior = await get('/candidates?city=rabat&experience=5-10', emp.token);
    expect(senior.body.data).toHaveLength(1);

    const named = await get('/candidates?q=karim', emp.token);
    expect(named.body.meta.total).toBe(1);

    expect((await get('/candidates?experience=forever', emp.token)).status).toBe(422);
    expect((await get('/candidates?page=0', emp.token)).status).toBe(422);
  });

  it('lists only complete, active profiles', async () => {
    const admin = await makeAdmin();
    const visible = await makeCandidate();
    await makeCandidate({ availability: '', searchable: false });
    const deleted = await makeCandidate();
    await deleted.profile.softDelete();
    const suspended = await makeCandidate();

    const res = await patch(`/admin/candidates/${idOf(suspended.profile)}/status`, admin.token, {
      status: 'suspended',
    });
    expect(res.status).toBe(200);

    const list = await get('/candidates');
    expect(list.body.data.map((c: any) => c.id)).toEqual([idOf(visible.profile)]);
  });

  it('never shows a rejected profile photo', async () => {
    const rejected = await makeCandidate();
    await MediaAsset.updateOne({ _id: rejected.photo._id }, { moderationStatus: 'rejected' });
    const shown = await makeCandidate();

    const list = await get('/candidates');
    const byId = new Map(list.body.data.map((c: any) => [c.id, c]));
    expect((byId.get(idOf(rejected.profile)) as any).photoUrl).toBeNull();
    expect((byId.get(idOf(shown.profile)) as any).photoUrl).toBe(shown.photo.url);
  });
});

describe('GET /candidates/:id', () => {
  it('shows guests the profile without contact details or rejected media', async () => {
    const cand = await makeCandidate();
    const approved = await makeMedia(cand.user._id, 'dish-photo', { moderationStatus: 'approved' });
    const rejected = await makeMedia(cand.user._id, 'dish-photo', { moderationStatus: 'rejected' });
    await CandidateProfile.updateOne(
      { _id: cand.profile._id },
      { foodPhotoIds: [approved._id, rejected._id] },
    );

    const res = await get(`/candidates/${idOf(cand.profile)}`);
    expect(res.status).toBe(200);
    expect(res.body.data.phone).toBeUndefined();
    expect(res.body.data.dishPhotos.map((d: any) => d.id)).toEqual([idOf(approved)]);
    expect(res.body.data.profileViews).toBe(1);
    expect(await Logs.countDocuments({ action: 'contact.viewed' })).toBe(0);
  });

  it('gives approved employers the phone and logs it; pending employers get nothing', async () => {
    const cand = await makeCandidate();
    const approved = await makeEmployer('active');
    const pending = await makeEmployer('pending');

    const seen = await get(`/candidates/${idOf(cand.profile)}`, approved.token);
    expect(seen.body.data.phone).toBe('0612345678');
    const log = await Logs.findOne({ action: 'contact.viewed' });
    expect(String(log.actorUserId)).toBe(idOf(approved.user));

    const hidden = await get(`/candidates/${idOf(cand.profile)}`, pending.token);
    expect(hidden.body.data.phone).toBeUndefined();
    expect(await Logs.countDocuments({ action: 'contact.viewed' })).toBe(1);
  });

  it('shows admins the phone only with view-contact', async () => {
    const cand = await makeCandidate();
    const url = `/candidates/${idOf(cand.profile)}`;
    const superAdmin = await makeAdmin();
    const noContact = await makeAdmin(['manage-candidates'], 'sub');
    const withContact = await makeAdmin(['view-contact'], 'sub');

    expect((await get(url, superAdmin.token)).body.data.phone).toBe('0612345678');
    expect((await get(url, noContact.token)).body.data.phone).toBeUndefined();
    expect((await get(url, withContact.token)).body.data.phone).toBe('0612345678');
  });

  it('404s for hidden profiles and 422s for malformed ids', async () => {
    const incomplete = await makeCandidate({ availability: '', searchable: false });
    const deleted = await makeCandidate();
    await deleted.profile.softDelete();

    expect((await get(`/candidates/${idOf(incomplete.profile)}`)).status).toBe(404);
    expect((await get(`/candidates/${idOf(deleted.profile)}`)).status).toBe(404);
    expect((await get(`/candidates/${new Types.ObjectId()}`)).status).toBe(404);
    expect((await get('/candidates/abc')).status).toBe(422);
  });
});

describe('/candidates/me', () => {
  it('belongs to candidates and returns their own media and contact details', async () => {
    const cand = await makeCandidate();
    const emp = await makeEmployer();
    const admin = await makeAdmin();

    expect((await get('/candidates/me')).status).toBe(401);
    expect((await get('/candidates/me', emp.token)).status).toBe(403);
    expect((await get('/candidates/me', admin.token)).status).toBe(403);

    const me = await get('/candidates/me', cand.token);
    expect(me.status).toBe(200);
    expect(me.body.data).toMatchObject({
      phone: '0612345678',
      photoUrl: cand.photo.url,
      photoModerationStatus: 'pending',
      dishPhotos: [],
      cvUrl: null,
    });
  });

  it('validates the patch', async () => {
    const cand = await makeCandidate();
    const cases: object[] = [
      { experience: 'forever' },
      { expectedSalary: -1 },
      { training: [{ school: 'Lycée' }] },
      { sectorId: 'kitchen', positionId: 'waiter' },
    ];
    for (const body of cases) {
      expect((await patch('/candidates/me', cand.token, body)).status).toBe(422);
    }

    const about = await patch('/candidates/me', cand.token, {
      about: { fr: 'Bonjour', en: 'Hello' },
    });
    expect(about.status).toBe(200);
    expect(about.body.data.about).toMatchObject({ fr: 'Bonjour', en: 'Hello' });
  });

  it('keeps completion and searchability in step with edits', async () => {
    const cand = await makeCandidate();

    const cleared = await patch('/candidates/me', cand.token, { phone: '' });
    expect(cleared.body.data.completionPercent).toBeLessThan(100);
    expect(cleared.body.data.searchable).toBe(false);

    const restored = await patch('/candidates/me', cand.token, { phone: '0600000000' });
    expect(restored.body.data.completionPercent).toBe(100);
    expect(restored.body.data.searchable).toBe(true);
  });
});

describe('candidate uploads', () => {
  it('stores a profile photo under a name derived from its type and completes the profile', async () => {
    const cand = await makeCandidate({ photoId: null, searchable: false });
    expect(cand.profile.completionPercent).toBeLessThan(100);

    const res = await upload('/candidates/me/photo', cand.token, 'photo', [photo('evil.html')]);
    expect(res.status).toBe(200);
    track(res.body.data.photoUrl);

    expect(res.body.data.photoUrl).toMatch(/\.jpg$/);
    expect(res.body.data.photoUrl).not.toContain('evil');
    expect(res.body.data.photoModerationStatus).toBe('pending');
    expect(res.body.data.completionPercent).toBe(100);
    expect(res.body.data.searchable).toBe(true);
    expect(fs.existsSync(path.join(uploadRoot, res.body.data.photoUrl.slice('/uploads/'.length)))).toBe(true);
  });

  it('retires a replaced photo, so moderators only review the current one', async () => {
    const cand = await makeCandidate();
    const admin = await makeAdmin();

    const first = await upload('/candidates/me/photo', cand.token, 'photo', [photo()]);
    const second = await upload('/candidates/me/photo', cand.token, 'photo', [photo()]);
    track(first.body.data.photoUrl, second.body.data.photoUrl);
    expect(first.body.data.photoUrl).not.toBe(second.body.data.photoUrl);

    const queue = await get('/admin/moderation/photos', admin.token);
    const mine = queue.body.data.filter((p: any) => p.candidateId === idOf(cand.profile));
    expect(mine.map((p: any) => p.url)).toEqual([second.body.data.photoUrl]);
    expect((await rawAsset(cand.photo._id))?.deletedAt).toBeTruthy();
  });

  it('rejects photos that are too small, of the wrong type, missing or oversized', async () => {
    const cand = await makeCandidate();
    const url = '/candidates/me/photo';

    expect((await upload(url, cand.token, 'photo', [{ buffer: tiny, name: 'a.jpg', type: 'image/jpeg' }])).status).toBe(422);
    expect((await upload(url, cand.token, 'photo', [{ buffer: jpeg, name: 'a.txt', type: 'text/plain' }])).status).toBe(422);
    expect((await upload(url, cand.token, 'photo', [{ buffer: Buffer.from('not an image'), name: 'a.png', type: 'image/png' }])).status).toBe(422);
    expect((await request(app).post(`${API}${url}`).set(bearer(cand.token))).status).toBe(422);
    expect((await upload(url, cand.token, 'avatar', [photo()])).status).toBe(400);
    expect(
      (await upload(url, cand.token, 'photo', [
        { buffer: Buffer.alloc(5 * 1024 * 1024 + 1), name: 'big.jpg', type: 'image/jpeg' },
      ])).status,
    ).toBe(413);

    expect(await MediaAsset.countDocuments({ ownerUserId: cand.user._id, kind: 'profile-photo' })).toBe(1);
  });

  it('uploads a batch of dish photos to distinct files', async () => {
    const cand = await makeCandidate();

    const res = await upload('/candidates/me/dish-photos', cand.token, 'photos', [
      photo(),
      { buffer: png, name: 'plate.png', type: 'image/png' },
    ]);
    expect(res.status).toBe(200);
    const urls = res.body.data.dishPhotos.map((d: any) => d.url);
    track(...urls);

    expect(urls).toHaveLength(2);
    expect(new Set(urls).size).toBe(2);
    expect(res.body.data.dishPhotos.every((d: any) => d.moderationStatus === 'pending')).toBe(true);
  });

  it('refuses dish photos past the limit, for ineligible positions, or when one file is bad', async () => {
    const full = await makeCandidate();
    const seven = [];
    for (let i = 0; i < 7; i += 1) seven.push((await makeMedia(full.user._id, 'dish-photo'))._id);
    await CandidateProfile.updateOne({ _id: full.profile._id }, { foodPhotoIds: seven });
    expect((await upload('/candidates/me/dish-photos', full.token, 'photos', [photo(), photo()])).status).toBe(422);

    const fresh = await makeCandidate();
    const nine = Array.from({ length: 9 }, () => photo());
    expect((await upload('/candidates/me/dish-photos', fresh.token, 'photos', nine)).status).toBe(400);

    const mixed = await upload('/candidates/me/dish-photos', fresh.token, 'photos', [
      photo(),
      { buffer: tiny, name: 'small.jpg', type: 'image/jpeg' },
    ]);
    expect(mixed.status).toBe(422);
    expect(await MediaAsset.countDocuments({ ownerUserId: fresh.user._id, kind: 'dish-photo' })).toBe(0);

    const waiter = await makeCandidate({ sectorId: 'service', positionId: 'waiter' });
    expect((await upload('/candidates/me/dish-photos', waiter.token, 'photos', [photo()])).status).toBe(422);
  });

  it('lets candidates delete only their own dish photos', async () => {
    const owner = await makeCandidate();
    const other = await makeCandidate();

    const uploaded = await upload('/candidates/me/dish-photos', owner.token, 'photos', [photo()]);
    track(...uploaded.body.data.dishPhotos.map((d: any) => d.url));
    const assetId = uploaded.body.data.dishPhotos[0].id;

    expect((await del(`/candidates/me/dish-photos/${assetId}`, other.token)).status).toBe(404);
    expect((await del('/candidates/me/dish-photos/abc', owner.token)).status).toBe(422);

    const removed = await del(`/candidates/me/dish-photos/${assetId}`, owner.token);
    expect(removed.status).toBe(200);
    expect(removed.body.data.dishPhotos).toEqual([]);
    expect((await rawAsset(new Types.ObjectId(assetId)))?.deletedAt).toBeTruthy();
  });

  it('accepts PDF and DOCX CVs, names them by content and replaces the previous one', async () => {
    const cand = await makeCandidate();

    const first = await upload('/candidates/me/cv', cand.token, 'cv', [
      { buffer: pdf, name: 'cv.html', type: 'application/pdf' },
    ]);
    expect(first.status).toBe(200);
    expect(first.body.data.cvUrl).toMatch(/\.pdf$/);

    const second = await upload('/candidates/me/cv', cand.token, 'cv', [
      {
        buffer: docx,
        name: 'cv.docx',
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      },
    ]);
    expect(second.body.data.cvUrl).toMatch(/\.docx$/);
    track(first.body.data.cvUrl, second.body.data.cvUrl);

    const cvs = await MediaAsset.collection.find({ ownerUserId: cand.user._id, kind: 'cv' }).toArray();
    expect(cvs).toHaveLength(2);
    expect(cvs.filter((cv: any) => cv.deletedAt)).toHaveLength(1);

    const text = await upload('/candidates/me/cv', cand.token, 'cv', [
      { buffer: Buffer.from('hello'), name: 'cv.txt', type: 'text/plain' },
    ]);
    expect(text.status).toBe(422);
  });
});

describe('employers', () => {
  it('/employers/me belongs to employers and validates the patch', async () => {
    const emp = await makeEmployer();
    const cand = await makeCandidate();

    expect((await get('/employers/me')).status).toBe(401);
    expect((await get('/employers/me', cand.token)).status).toBe(403);
    const me = await get('/employers/me', emp.token);
    expect(me.status).toBe(200);
    expect(me.body.data.logoUrl).toBeNull();

    expect((await patch('/employers/me', emp.token, { type: 'spaceship' })).status).toBe(422);
    expect((await patch('/employers/me', emp.token, { phonePublic: 'yes' })).status).toBe(422);

    await patch('/employers/me', emp.token, { socials: { instagram: '@chez' } });
    const merged = await patch('/employers/me', emp.token, { socials: { website: 'https://chez.ma' } });
    expect(merged.body.data.socials).toMatchObject({ instagram: '@chez', website: 'https://chez.ma' });
  });

  it('shows only approved establishments publicly and hides a private phone', async () => {
    const active = await makeEmployer('active');
    await EmployerProfile.updateOne({ _id: active.profile._id }, { phone: '0522000000' });
    const pending = await makeEmployer('pending');
    const blocked = await makeEmployer('blocked');

    const privatePhone = await get(`/employers/${idOf(active.profile)}`);
    expect(privatePhone.status).toBe(200);
    expect(privatePhone.body.data.phone).toBeUndefined();

    await EmployerProfile.updateOne({ _id: active.profile._id }, { phonePublic: true });
    expect((await get(`/employers/${idOf(active.profile)}`)).body.data.phone).toBe('0522000000');

    expect((await get(`/employers/${idOf(pending.profile)}`)).status).toBe(404);
    expect((await get(`/employers/${idOf(blocked.profile)}`)).status).toBe(404);
    expect((await get('/employers/abc')).status).toBe(422);
  });

  it('uploads a logo and a cover, retiring the replaced logo', async () => {
    const emp = await makeEmployer();
    const cand = await makeCandidate();

    const first = await upload('/employers/me/logo', emp.token, 'logo', [
      { buffer: png, name: 'logo.svg', type: 'image/png' },
    ]);
    expect(first.status).toBe(200);
    expect(first.body.data.logoUrl).toMatch(/\.png$/);
    const firstLogoId = first.body.data.logoId;

    const second = await upload('/employers/me/logo', emp.token, 'logo', [photo()]);
    const cover = await upload('/employers/me/cover', emp.token, 'cover', [photo()]);
    track(first.body.data.logoUrl, second.body.data.logoUrl, cover.body.data.coverUrl);

    expect(second.body.data.logoUrl).toMatch(/\.jpg$/);
    expect(cover.body.data.coverUrl).toMatch(/\.jpg$/);
    expect((await rawAsset(new Types.ObjectId(firstLogoId)))?.deletedAt).toBeTruthy();

    expect(
      (await upload('/employers/me/logo', emp.token, 'logo', [{ buffer: tiny, name: 'l.jpg', type: 'image/jpeg' }])).status,
    ).toBe(422);
    expect((await upload('/employers/me/logo', cand.token, 'logo', [photo()])).status).toBe(403);
  });

  it('counts active offers, applicants, saved profiles and offer views', async () => {
    const emp = await makeEmployer();
    const job = await makeJob(emp.profile._id, 'active', { viewCount: 5 });
    await makeJob(emp.profile._id, 'active', { viewCount: 3 });
    await makeJob(emp.profile._id, 'pending');
    const cand = await makeCandidate();

    expect((await post('/applications', cand.token, { jobId: idOf(job) })).status).toBe(201);
    expect((await post('/bookmarks/profiles', emp.token, { targetId: idOf(cand.profile) })).status).toBe(201);

    const res = await get('/employers/me/dashboard', emp.token);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ activeOffers: 2, applicants: 1, savedProfiles: 1, profileViews: 8 });
  });
});

describe('bookmarks', () => {
  it('employers save, list and remove candidate profiles', async () => {
    const emp = await makeEmployer();
    const other = await makeEmployer();
    const cand = await makeCandidate();
    const targetId = idOf(cand.profile);

    const saved = await post('/bookmarks/profiles', emp.token, { targetId, note: 'Bon profil' });
    expect(saved.status).toBe(201);
    expect(saved.body.data).toMatchObject({ targetId, kind: 'saved-profile', note: 'Bon profil' });
    expect((await post('/bookmarks/profiles', emp.token, { targetId })).status).toBe(409);

    expect((await get('/bookmarks/profiles', emp.token)).body.data).toHaveLength(1);
    expect((await get('/bookmarks/profiles', other.token)).body.data).toHaveLength(0);

    expect((await del(`/bookmarks/profiles?targetId=${targetId}`, emp.token)).status).toBe(200);
    expect((await del(`/bookmarks/profiles?targetId=${targetId}`, emp.token)).status).toBe(404);
    expect((await post('/bookmarks/profiles', emp.token, { targetId: 'x' })).status).toBe(422);
    expect((await del('/bookmarks/profiles', emp.token)).status).toBe(422);
    expect((await get('/bookmarks/profiles', cand.token)).status).toBe(403);
  });

  it('candidates save published offers only', async () => {
    const cand = await makeCandidate();
    const emp = await makeEmployer();
    const active = await makeJob(emp.profile._id, 'active');
    const expired = await makeJob(emp.profile._id, 'expired');
    const pending = await makeJob(emp.profile._id, 'pending');
    const draft = await makeJob(emp.profile._id, 'draft');

    expect((await post('/bookmarks/jobs', cand.token, { targetId: idOf(active) })).status).toBe(201);
    expect((await post('/bookmarks/jobs', cand.token, { targetId: idOf(expired) })).status).toBe(201);
    expect((await post('/bookmarks/jobs', cand.token, { targetId: idOf(pending) })).status).toBe(404);
    expect((await post('/bookmarks/jobs', cand.token, { targetId: idOf(draft) })).status).toBe(404);

    expect((await get('/bookmarks/jobs', cand.token)).body.data).toHaveLength(2);
    expect((await get('/bookmarks/jobs', emp.token)).status).toBe(403);
    expect((await del(`/bookmarks/jobs?targetId=${idOf(active)}`, cand.token)).status).toBe(200);
  });

  it('hides saved offers that are no longer public, and shows them again when they are', async () => {
    const { Job } = await import('../src/modules/job/job.model');
    const cand = await makeCandidate();
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const blockedEmp = await makeEmployer();
    const deleted = await makeJob(emp.profile._id, 'active');
    const unpublished = await makeJob(emp.profile._id, 'active');
    const ofBlocked = await makeJob(blockedEmp.profile._id, 'active');
    const kept = await makeJob(emp.profile._id, 'active');

    for (const job of [deleted, unpublished, ofBlocked, kept]) {
      expect((await post('/bookmarks/jobs', cand.token, { targetId: idOf(job) })).status).toBe(201);
    }

    await deleted.softDelete();
    await Job.updateOne({ _id: unpublished._id }, { status: 'pending' });
    const blockUrl = `/admin/employers/${idOf(blockedEmp.profile)}/block`;
    expect((await patch(blockUrl, admin.token, { blocked: true })).status).toBe(200);

    const hidden = await get('/bookmarks/jobs', cand.token);
    expect(hidden.body.data.map((b: any) => b.targetId)).toEqual([idOf(kept)]);

    await patch(blockUrl, admin.token, { blocked: false });
    const back = await get('/bookmarks/jobs', cand.token);
    expect(back.body.data.map((b: any) => b.targetId).sort()).toEqual([idOf(kept), idOf(ofBlocked)].sort());

    expect((await del(`/bookmarks/jobs?targetId=${idOf(unpublished)}`, cand.token)).status).toBe(200);
  });

  it('hides saved profiles employers can no longer open', async () => {
    const emp = await makeEmployer();
    const admin = await makeAdmin();
    const suspended = await makeCandidate();
    const deleted = await makeCandidate();
    const kept = await makeCandidate();

    for (const cand of [suspended, deleted, kept]) {
      expect((await post('/bookmarks/profiles', emp.token, { targetId: idOf(cand.profile) })).status).toBe(201);
    }

    await patch(`/admin/candidates/${idOf(suspended.profile)}/status`, admin.token, { status: 'suspended' });
    await del(`/admin/candidates/${idOf(deleted.profile)}`, admin.token);

    const list = await get('/bookmarks/profiles', emp.token);
    expect(list.body.data.map((b: any) => b.targetId)).toEqual([idOf(kept.profile)]);

    const incomplete = await makeCandidate({ availability: '', searchable: false });
    expect((await post('/bookmarks/profiles', emp.token, { targetId: idOf(incomplete.profile) })).status).toBe(404);

    await patch(`/admin/candidates/${idOf(suspended.profile)}/status`, admin.token, { status: 'active' });
    expect((await get('/bookmarks/profiles', emp.token)).body.data).toHaveLength(2);
  });
});

describe('admin candidates', () => {
  it('lists with filters and totals, withholding emails from admins without view-contact', async () => {
    const superAdmin = await makeAdmin();
    await makeCandidate({ city: 'rabat', verified: true, firstName: 'Karim' });
    await makeCandidate({ city: 'casablanca' });
    await makeCandidate({ city: 'rabat', availability: '' });

    const all = await get('/admin/candidates', superAdmin.token);
    expect(all.status).toBe(200);
    expect(all.body.meta.total).toBe(3);
    expect(all.body.data.every((c: any) => c.phone === undefined)).toBe(true);
    expect(all.body.data.every((c: any) => typeof c.user.email === 'string')).toBe(true);

    expect((await get('/admin/candidates?city=rabat', superAdmin.token)).body.meta.total).toBe(2);
    expect((await get('/admin/candidates?verified=true', superAdmin.token)).body.meta.total).toBe(1);
    expect((await get('/admin/candidates?minCompletion=100', superAdmin.token)).body.meta.total).toBe(2);
    expect((await get('/admin/candidates?q=karim', superAdmin.token)).body.meta.total).toBe(1);
    expect((await get('/admin/candidates?limit=500', superAdmin.token)).body.meta.limit).toBe(100);

    const noContact = await makeAdmin(['manage-candidates'], 'sub');
    const masked = await get('/admin/candidates', noContact.token);
    expect(masked.body.data.every((c: any) => c.user.email === undefined)).toBe(true);
    expect(masked.body.data[0].user.status).toBe('active');

    const withContact = await makeAdmin(['manage-candidates', 'view-contact'], 'sub');
    const shown = await get('/admin/candidates', withContact.token);
    expect(shown.body.data.every((c: any) => typeof c.user.email === 'string')).toBe(true);
  });

  it('lists suspended and deleted candidates by status', async () => {
    const admin = await makeAdmin();
    const suspended = await makeCandidate();
    const deleted = await makeCandidate();

    await patch(`/admin/candidates/${idOf(suspended.profile)}/status`, admin.token, { status: 'suspended' });
    expect((await del(`/admin/candidates/${idOf(deleted.profile)}`, admin.token)).status).toBe(200);

    const bySuspended = await get('/admin/candidates?status=suspended', admin.token);
    expect(bySuspended.body.data.map((c: any) => c.id)).toEqual([idOf(suspended.profile)]);

    const byDeleted = await get('/admin/candidates?status=deleted', admin.token);
    expect(byDeleted.body.data.map((c: any) => c.id)).toEqual([idOf(deleted.profile)]);
    expect(byDeleted.body.data[0].user.status).toBe('deleted');

    const defaultList = await get('/admin/candidates', admin.token);
    expect(defaultList.body.data.map((c: any) => c.id)).not.toContain(idOf(deleted.profile));
  });

  it('reveals contact details only on a permitted request, and logs the reveal', async () => {
    const cand = await makeCandidate();
    const superAdmin = await makeAdmin();
    const noContact = await makeAdmin(['manage-candidates'], 'sub');
    const url = `/admin/candidates/${idOf(cand.profile)}`;

    const plain = await get(url, superAdmin.token);
    expect(plain.status).toBe(200);
    expect(plain.body.data.phone).toBeUndefined();
    expect(plain.body.data.user.email).toBeUndefined();
    expect(await Logs.countDocuments({ action: 'contact.viewed' })).toBe(0);

    const revealed = await get(`${url}?revealContact=true`, superAdmin.token);
    expect(revealed.body.data.phone).toBe('0612345678');
    expect(revealed.body.data.user.email).toBe(cand.user.email);
    expect(await Logs.countDocuments({ action: 'contact.viewed' })).toBe(1);

    const refused = await get(`${url}?revealContact=true`, noContact.token);
    expect(refused.body.data.phone).toBeUndefined();
    expect(refused.body.data.user.email).toBeUndefined();
    expect(await Logs.countDocuments({ action: 'contact.viewed' })).toBe(1);

    expect((await get(`${url}?revealContact=maybe`, superAdmin.token)).status).toBe(422);
  });

  it('edits a profile through a strict schema and keeps searchability in step', async () => {
    const cand = await makeCandidate();
    const admin = await makeAdmin();
    const url = `/admin/candidates/${idOf(cand.profile)}`;

    expect((await patch(url, admin.token, { nickname: 'x' })).status).toBe(422);
    expect((await patch(url, admin.token, { experience: 'forever' })).status).toBe(422);
    expect((await patch(url, admin.token, { sectorId: 'kitchen', positionId: 'waiter' })).status).toBe(422);

    const incomplete = await patch(url, admin.token, { availability: '' });
    expect(incomplete.status).toBe(200);
    expect(incomplete.body.data.completionPercent).toBeLessThan(100);
    expect(incomplete.body.data.searchable).toBe(false);
    expect((await get(`/candidates/${idOf(cand.profile)}`)).status).toBe(404);

    const complete = await patch(url, admin.token, { availability: 'immediate', firstName: 'Zed' });
    expect(complete.body.data).toMatchObject({ firstName: 'Zed', searchable: true, completionPercent: 100 });
    expect(await Logs.countDocuments({ action: 'candidate.updated' })).toBe(2);
  });

  it('adds skills once and ignores removing a skill the candidate does not have', async () => {
    const cand = await makeCandidate();
    const admin = await makeAdmin();
    const url = `/admin/candidates/${idOf(cand.profile)}/skills`;

    await post(url, admin.token, { skillId: 'haccp' });
    const twice = await post(url, admin.token, { skillId: 'haccp' });
    expect(twice.body.data.skills.filter((s: string) => s === 'haccp')).toHaveLength(1);
    expect(await Logs.countDocuments({ action: 'candidate.skillAdded' })).toBe(1);

    expect((await del(`${url}/french`, admin.token)).status).toBe(200);
    expect(await Logs.countDocuments({ action: 'candidate.skillRemoved' })).toBe(0);

    const removed = await del(`${url}/haccp`, admin.token);
    expect(removed.body.data.skills).not.toContain('haccp');
    expect(removed.body.data.completionPercent).toBe(100);
    expect(await Logs.countDocuments({ action: 'candidate.skillRemoved' })).toBe(1);

    expect((await post(url, admin.token, { skillId: '' })).status).toBe(422);
  });

  it('verifies and unverifies, notifying only on verification', async () => {
    const cand = await makeCandidate();
    const admin = await makeAdmin();
    const url = `/admin/candidates/${idOf(cand.profile)}/verification`;

    const verified = await patch(url, admin.token, { verified: true });
    expect(verified.body.data.verified).toBe(true);
    expect(verified.body.data.verifiedAt).toBeTruthy();
    expect(await Notifications.countDocuments({ userId: cand.user._id })).toBe(1);

    const unverified = await patch(url, admin.token, { verified: false });
    expect(unverified.body.data).toMatchObject({ verified: false, verifiedAt: null });
    expect(await Notifications.countDocuments({ userId: cand.user._id })).toBe(1);

    expect((await patch(url, admin.token, { verified: 'yes' })).status).toBe(422);
    expect(await Logs.countDocuments({ action: { $in: ['candidate.verified', 'candidate.unverified'] } })).toBe(2);
  });

  it('suspends, deletes and restores a candidate', async () => {
    const cand = await makeCandidate();
    const admin = await makeAdmin();
    const url = `/admin/candidates/${idOf(cand.profile)}`;
    const publicUrl = `/candidates/${idOf(cand.profile)}`;

    await patch(`${url}/status`, admin.token, { status: 'suspended' });
    expect((await anyUser(cand.user._id))?.status).toBe('suspended');
    expect((await get(publicUrl)).status).toBe(404);

    await patch(`${url}/status`, admin.token, { status: 'active' });
    expect((await get(publicUrl)).status).toBe(200);

    const deleted = await patch(`${url}/status`, admin.token, { status: 'deleted' });
    expect(deleted.status).toBe(200);
    expect((await rawProfile(cand.profile._id))?.deletedAt).toBeTruthy();
    expect((await get(publicUrl)).status).toBe(404);
    const detail = await get(url, admin.token);
    expect(detail.status).toBe(200);
    expect(detail.body.data.user.status).toBe('deleted');

    const restored = await patch(`${url}/status`, admin.token, { status: 'active' });
    expect(restored.status).toBe(200);
    expect(restored.body.data.searchable).toBe(true);
    expect((await get(publicUrl)).status).toBe(200);
    const user = await anyUser(cand.user._id);
    expect(user?.status).toBe('active');
    expect(user?.deletedAt).toBeNull();

    expect((await patch(`${url}/status`, admin.token, { status: 'banished' })).status).toBe(422);
  });

  it('deletes candidates only with delete-users', async () => {
    const cand = await makeCandidate();
    const superAdmin = await makeAdmin();
    const manager = await makeAdmin(['manage-candidates'], 'sub');
    const url = `/admin/candidates/${idOf(cand.profile)}`;

    expect((await del(url, manager.token)).status).toBe(403);
    expect((await del(url, superAdmin.token)).status).toBe(200);
    expect(await Logs.countDocuments({ action: 'candidate.deleted' })).toBe(1);
    expect((await del(url, superAdmin.token)).status).toBe(404);
    expect((await get(`/candidates/${idOf(cand.profile)}`)).status).toBe(404);
  });

  it('shows applications and history, including for deleted candidates', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const cand = await makeCandidate();
    const job = await makeJob(emp.profile._id, 'active');
    const url = `/admin/candidates/${idOf(cand.profile)}`;

    expect((await post('/applications', cand.token, { jobId: idOf(job) })).status).toBe(201);
    await patch(`${url}/verification`, admin.token, { verified: true });
    await get(`${url}?revealContact=true`, admin.token);

    const applications = await get(`${url}/applications`, admin.token);
    expect(applications.body.data).toHaveLength(1);
    expect(applications.body.data[0].job.title.fr).toBe('Chef de partie');
    expect(applications.body.data[0].employer.name).toBe('Chez Fixtures');

    const history = await get(`${url}/history`, admin.token);
    expect(history.body.data.contactRequests).toHaveLength(1);
    expect(history.body.data.adminActions.map((a: any) => a.action)).toContain('candidate.verified');

    await del(url, admin.token);
    expect((await get(`${url}/applications`, admin.token)).status).toBe(200);
    expect((await get(`${url}/history`, admin.token)).status).toBe(200);
  });

  it('exports CSV with contact columns only when permitted, neutralising formulas', async () => {
    const cand = await makeCandidate({ lastName: '=HYPERLINK("http://evil")', phone: '+212612345678' });
    const superAdmin = await makeAdmin();
    const exporter = await makeAdmin(['export-cv'], 'sub');
    const manager = await makeAdmin(['manage-candidates'], 'sub');

    expect((await get('/admin/candidates/export', manager.token)).status).toBe(403);

    const noContact = await get('/admin/candidates/export?withContact=true', exporter.token);
    expect(noContact.status).toBe(200);
    expect(noContact.headers['content-type']).toContain('text/csv');
    expect(noContact.text).not.toContain('phone');
    expect(await Logs.countDocuments({ action: 'contact.exported' })).toBe(0);

    const withContact = await get('/admin/candidates/export?withContact=true', superAdmin.token);
    const [header] = withContact.text.replace(/^﻿/, '').split('\n');
    expect(header).toContain('phone,email');
    expect(withContact.text).toContain('+212612345678');
    expect(withContact.text).not.toContain("'+212");
    expect(withContact.text).toContain(cand.user.email);
    expect(withContact.text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(await Logs.countDocuments({ action: 'contact.exported' })).toBe(1);
  });

  it('answers unknown and malformed candidate ids', async () => {
    const admin = await makeAdmin();
    const unknown = String(new Types.ObjectId());
    for (const suffix of ['', '/applications', '/history']) {
      expect((await get(`/admin/candidates/${unknown}${suffix}`, admin.token)).status).toBe(404);
      expect((await get(`/admin/candidates/abc${suffix}`, admin.token)).status).toBe(422);
    }
    expect((await patch(`/admin/candidates/${unknown}/verification`, admin.token, { verified: true })).status).toBe(404);
    expect((await patch(`/admin/candidates/${unknown}/status`, admin.token, { status: 'active' })).status).toBe(404);
  });
});

describe('admin employers', () => {
  it('lists, filters and searches establishments; requests are the pending ones', async () => {
    const admin = await makeAdmin();
    await makeEmployer('active');
    await makeEmployer('pending');
    const blocked = await makeEmployer('blocked');
    await EmployerProfile.updateOne({ _id: blocked.profile._id }, { name: 'Riad Fes' });

    const all = await get('/admin/employers', admin.token);
    expect(all.body.meta.total).toBe(3);
    expect(all.body.data[0].user.email).toBeTruthy();
    expect((await get('/admin/employers?status=pending', admin.token)).body.meta.total).toBe(1);
    expect((await get('/admin/employers?q=riad', admin.token)).body.meta.total).toBe(1);

    const requests = await get('/admin/employers/requests', admin.token);
    expect(requests.body.data).toHaveLength(1);
    expect(requests.body.data[0].status).toBe('pending');
  });

  it('shows an establishment and its activity', async () => {
    const admin = await makeAdmin();
    const emp = await makeEmployer();
    const cand = await makeCandidate();
    const active = await makeJob(emp.profile._id, 'active');
    await makeJob(emp.profile._id, 'pending');
    await post('/applications', cand.token, { jobId: idOf(active) });

    const detail = await get(`/admin/employers/${idOf(emp.profile)}`, admin.token);
    expect(detail.body.data.name).toBe('Chez Fixtures');

    const activity = await get(`/admin/employers/${idOf(emp.profile)}/activity`, admin.token);
    expect(activity.body.data).toMatchObject({ offersPublished: 2, offersActive: 1, applicationsReceived: 1 });

    const unknown = String(new Types.ObjectId());
    expect((await get(`/admin/employers/${unknown}`, admin.token)).status).toBe(404);
    expect((await get(`/admin/employers/${unknown}/activity`, admin.token)).status).toBe(404);
    expect((await get('/admin/employers/abc', admin.token)).status).toBe(422);
  });

  it('approves or rejects a pending establishment', async () => {
    const admin = await makeAdmin();
    const toApprove = await makeEmployer('pending');
    const toReject = await makeEmployer('pending');

    const approved = await patch(`/admin/employers/${idOf(toApprove.profile)}/decision`, admin.token, { status: 'active' });
    expect(approved.body.data).toMatchObject({ status: 'active', verified: true, reviewedBy: idOf(admin.user) });
    expect(await Notifications.countDocuments({ userId: toApprove.user._id })).toBe(1);
    expect(await Logs.countDocuments({ action: 'employer.approved' })).toBe(1);
    expect((await get(`/employers/${idOf(toApprove.profile)}`)).status).toBe(200);

    const rejectUrl = `/admin/employers/${idOf(toReject.profile)}/decision`;
    expect((await patch(rejectUrl, admin.token, { status: 'rejected' })).status).toBe(422);
    const rejected = await patch(rejectUrl, admin.token, { status: 'rejected', rejectionReason: 'Documents illisibles' });
    expect(rejected.body.data).toMatchObject({ status: 'rejected', rejectionReason: 'Documents illisibles' });
    expect((await get(`/employers/${idOf(toReject.profile)}`)).status).toBe(404);

    expect((await patch(rejectUrl, admin.token, { status: 'maybe' })).status).toBe(422);
  });

  it('blocks and unblocks without approving an establishment that never was', async () => {
    const admin = await makeAdmin();
    const approved = await makeEmployer('active');
    const pending = await makeEmployer('pending');
    const blockUrl = (e: any) => `/admin/employers/${idOf(e.profile)}/block`;

    const blocked = await patch(blockUrl(approved), admin.token, { blocked: true, reason: 'Abus' });
    expect(blocked.body.data).toMatchObject({ status: 'blocked', rejectionReason: 'Abus' });
    expect(await Notifications.countDocuments({ userId: approved.user._id })).toBe(1);
    expect((await get(`/employers/${idOf(approved.profile)}`)).status).toBe(404);

    const unblocked = await patch(blockUrl(approved), admin.token, { blocked: false });
    expect(unblocked.body.data).toMatchObject({ status: 'active', rejectionReason: null });
    expect((await get(`/employers/${idOf(approved.profile)}`)).status).toBe(200);

    await patch(blockUrl(pending), admin.token, { blocked: true });
    const stillPending = await patch(blockUrl(pending), admin.token, { blocked: false });
    expect(stillPending.body.data.status).toBe('pending');

    expect((await patch(blockUrl(pending), admin.token, { blocked: 'yes' })).status).toBe(422);
  });

  it('requires manage-employers', async () => {
    const manager = await makeAdmin(['manage-candidates'], 'sub');
    const employers = await makeAdmin(['manage-employers'], 'sub');
    expect((await get('/admin/employers', manager.token)).status).toBe(403);
    expect((await get('/admin/employers', employers.token)).status).toBe(200);
  });
});

describe('admin moderation', () => {
  it('queues only candidate photos, with who uploaded them', async () => {
    const cand = await makeCandidate();
    await makeMedia(cand.user._id, 'dish-photo');
    await makeMedia(cand.user._id, 'cv');
    const emp = await makeEmployer();
    await makeMedia(emp.user._id, 'logo');
    const moderator = await makeAdmin(['approve-photos'], 'sub');

    const res = await get('/admin/moderation/photos', moderator.token);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: any) => p.kind).sort()).toEqual(['dish-photo', 'profile-photo']);
    for (const item of res.body.data) {
      expect(item.candidateId).toBe(idOf(cand.profile));
      expect(item.candidate).toMatchObject({ firstName: 'Amina', lastName: 'Fixtures' });
      expect(item.candidate.phone).toBeUndefined();
    }

    expect((await get('/admin/moderation/photos?status=approved', moderator.token)).body.data).toEqual([]);
    expect((await get('/admin/moderation/photos?status=bogus', moderator.token)).status).toBe(422);
  });

  it('approves a photo', async () => {
    const cand = await makeCandidate();
    const admin = await makeAdmin();

    const res = await patch(`/admin/moderation/photos/${idOf(cand.photo)}`, admin.token, { status: 'approved' });
    expect(res.status).toBe(200);
    expect(res.body.data.moderationStatus).toBe('approved');
    expect((await get('/admin/moderation/photos', admin.token)).body.data).toEqual([]);
    expect((await get('/admin/moderation/photos?status=approved', admin.token)).body.data).toHaveLength(1);
    expect(await Logs.countDocuments({ action: 'photo.approved' })).toBe(1);
  });

  it('rejects a profile photo with a reason and takes it off the profile', async () => {
    const cand = await makeCandidate();
    const admin = await makeAdmin();
    const url = `/admin/moderation/photos/${idOf(cand.photo)}`;

    expect((await patch(url, admin.token, { status: 'rejected' })).status).toBe(422);

    const res = await patch(url, admin.token, { status: 'rejected', reason: 'Visage non visible' });
    expect(res.status).toBe(200);

    const profile = await rawProfile(cand.profile._id);
    expect(profile?.photoId).toBeNull();
    expect(profile?.completionPercent).toBeLessThan(100);
    expect(profile?.searchable).toBe(false);

    const note = await Notifications.findOne({ userId: cand.user._id });
    expect(JSON.stringify(note.body)).toContain('Visage non visible');
    expect(await Logs.countDocuments({ action: 'photo.rejected' })).toBe(1);
    expect((await get('/candidates/me', cand.token)).body.data.photoUrl).toBeNull();
  });

  it('rejecting a dish photo frees its slot', async () => {
    const cand = await makeCandidate();
    const admin = await makeAdmin();
    const dish = await makeMedia(cand.user._id, 'dish-photo');
    await CandidateProfile.updateOne({ _id: cand.profile._id }, { foodPhotoIds: [dish._id] });

    const res = await patch(`/admin/moderation/photos/${idOf(dish)}`, admin.token, {
      status: 'rejected',
      reason: 'Photo floue',
    });
    expect(res.status).toBe(200);
    expect((await rawProfile(cand.profile._id))?.foodPhotoIds).toEqual([]);
  });

  it('only moderates candidate photos', async () => {
    const cand = await makeCandidate();
    const admin = await makeAdmin();
    const cv = await makeMedia(cand.user._id, 'cv');

    expect((await patch(`/admin/moderation/photos/${idOf(cv)}`, admin.token, { status: 'approved' })).status).toBe(404);
    expect((await patch(`/admin/moderation/photos/${new Types.ObjectId()}`, admin.token, { status: 'approved' })).status).toBe(404);
    expect((await patch('/admin/moderation/photos/abc', admin.token, { status: 'approved' })).status).toBe(422);
    expect((await patch(`/admin/moderation/photos/${idOf(cand.photo)}`, admin.token, { status: 'maybe' })).status).toBe(422);
  });

  it('lists open reports and enforces approve-photos', async () => {
    const moderator = await makeAdmin(['approve-photos'], 'sub');
    const manager = await makeAdmin(['manage-candidates'], 'sub');
    await ModerationReport.create({ targetType: 'job', targetId: new Types.ObjectId(), reason: 'Arnaque' });
    await ModerationReport.create({
      targetType: 'job',
      targetId: new Types.ObjectId(),
      reason: 'Doublon',
      status: 'dismissed',
    });

    const reports = await get('/admin/moderation/reports', moderator.token);
    expect(reports.body.data.map((r: any) => r.reason)).toEqual(['Arnaque']);

    expect((await get('/admin/moderation/photos', manager.token)).status).toBe(403);
    expect((await get('/admin/moderation/reports', manager.token)).status).toBe(403);
  });
});
