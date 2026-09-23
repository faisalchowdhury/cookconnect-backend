import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { Types } from 'mongoose';
import { createApp } from '../src/app';
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
const SRC = path.resolve(__dirname, '../src/modules');

// Where each router is mounted (routes/index.ts and admin/admin.route.ts).
const MOUNTS: Record<string, Record<string, string>> = {
  'health/health.route.ts': { router: '/health' },
  'auth/auth.route.ts': { router: '/auth' },
  'candidate/candidate.route.ts': { router: '/candidates' },
  'employer/employer.route.ts': { router: '/employers' },
  'job/job.route.ts': { router: '/jobs' },
  'application/application.route.ts': { router: '/applications' },
  'bookmark/bookmark.route.ts': { router: '/bookmarks' },
  'taxonomy/taxonomy.route.ts': { router: '/taxonomies' },
  'notification/notification.route.ts': { router: '/notifications' },
  'feedback/feedback.route.ts': { router: '/feedback' },
  'banner/banner.route.ts': { router: '/banners' },
  'partner/partner.route.ts': { router: '/partners' },
  'siteSettings/siteSettings.route.ts': { router: '/site-settings' },
  'analytics/analytics.admin.route.ts': {
    dashboardRouter: '/admin/dashboard',
    statisticsRouter: '/admin/statistics',
  },
  'admin/admin.candidates.route.ts': { router: '/admin/candidates' },
  'admin/admin.employers.route.ts': { router: '/admin/employers' },
  'job/job.admin.route.ts': { router: '/admin/jobs' },
  'admin/admin.moderation.route.ts': { router: '/admin/moderation' },
  'admin/admin.activity.route.ts': { router: '/admin/activity' },
  'feedback/feedback.admin.route.ts': { router: '/admin/feedback' },
  'banner/banner.admin.route.ts': { router: '/admin/banners' },
  'partner/partner.admin.route.ts': { router: '/admin/partners' },
  'taxonomy/taxonomy.admin.route.ts': { router: '/admin/taxonomies' },
  'siteSettings/siteSettings.admin.route.ts': { router: '/admin/site-settings' },
  'admin/admin.media.route.ts': { router: '/admin/media' },
  'admin/admin.notifications.route.ts': { router: '/admin/notifications' },
  'admin/admin.admins.route.ts': { router: '/admin/admins' },
};

type Route = { method: string; path: string; middleware: string };
type Identity = 'guest' | 'candidate' | 'employer' | 'subAdmin' | 'superAdmin';

const IDENTITIES: Identity[] = ['guest', 'candidate', 'employer', 'subAdmin', 'superAdmin'];

function listRoutes(): Route[] {
  const routes: Route[] = [];
  for (const [file, routers] of Object.entries(MOUNTS)) {
    const src = fs.readFileSync(path.join(SRC, file), 'utf8');
    for (const [name, prefix] of Object.entries(routers)) {
      const shared = [...src.matchAll(new RegExp(`\\b${name}\\.use\\(([\\s\\S]*?)\\);`, 'g'))]
        .map((m) => m[1])
        .join(' ');
      const defs = new RegExp(
        `\\b${name}\\.(get|post|put|patch|delete)\\(\\s*['"]([^'"]*)['"]\\s*,([\\s\\S]*?)\\);`,
        'g',
      );
      for (const m of src.matchAll(defs)) {
        routes.push({
          method: m[1].toUpperCase(),
          path: `${API}${prefix}${m[2] === '/' ? '' : m[2]}`,
          middleware: `${shared} ${m[3]}`,
        });
      }
    }
  }
  return routes;
}

function accessOf(middleware: string) {
  const listArgs = (fn: string) =>
    [...middleware.matchAll(new RegExp(`${fn}\\(([^)]*)\\)`, 'g'))].flatMap(
      (m) => m[1].match(/[a-z-]+/g) ?? [],
    );
  return {
    auth: /\bauth\(\)/.test(middleware),
    roles: listArgs('authorize'),
    perms: listArgs('hasPermission'),
  };
}

function allowedIdentity(middleware: string): Identity {
  const a = accessOf(middleware);
  if (a.perms.length) return 'superAdmin';
  if (a.roles.includes('candidate')) return 'candidate';
  if (a.roles.includes('employer')) return 'employer';
  if (a.roles.includes('admin')) return 'superAdmin';
  return a.auth ? 'candidate' : 'guest';
}

const routes = listRoutes();

let tokens: Record<Identity, string | undefined>;
let ids: Record<string, string>;

const ENTITY_BY_SEGMENT: Record<string, string> = {
  candidates: 'candidate',
  employers: 'employer',
  jobs: 'job',
  applications: 'application',
  notifications: 'notification',
  feedback: 'feedback',
  photos: 'media',
  admins: 'admin',
};

function fill(routePath: string, badId?: string): string {
  const parts = routePath.split('/');
  return parts
    .map((part, i) => {
      if (part === ':id') {
        return badId ?? ids[ENTITY_BY_SEGMENT[parts[i - 1]]] ?? String(new Types.ObjectId());
      }
      if (part === ':assetId') return badId ?? ids.media;
      if (part === ':skillId') return 'haccp';
      if (part === ':type') return 'sector';
      if (part === ':key') return 'kitchen';
      return part;
    })
    .join('/');
}

function call(method: string, url: string, identity: Identity, body?: unknown) {
  const req = (request(app) as any)[method.toLowerCase()](url);
  const token = tokens[identity];
  if (token) req.set('Authorization', `Bearer ${token}`);
  if (method !== 'GET' && method !== 'DELETE') req.send(body ?? {});
  return req;
}

beforeEach(async () => {
  await seedTaxonomy();
  const superAdmin = await makeAdmin();
  const subAdmin = await makeAdmin(['approve-photos'], 'sub');
  const employer = await makeEmployer();
  const candidate = await makeCandidate();
  const job = await makeJob(employer.profile._id);
  const dish = await makeMedia(candidate.user._id, 'dish-photo');

  const applied = await request(app)
    .post(`${API}/applications`)
    .set('Authorization', `Bearer ${candidate.token}`)
    .send({ jobId: String(job._id) });
  const notifications = await request(app)
    .get(`${API}/notifications`)
    .set('Authorization', `Bearer ${employer.token}`);
  const feedback = await request(app)
    .post(`${API}/feedback`)
    .set('Authorization', `Bearer ${candidate.token}`)
    .send({ role: 'candidate', rating: 5, message: 'Matrix' });

  tokens = {
    guest: undefined,
    candidate: candidate.token,
    employer: employer.token,
    subAdmin: subAdmin.token,
    superAdmin: superAdmin.token,
  };
  ids = {
    candidate: String(candidate.profile._id),
    employer: String(employer.profile._id),
    job: String(job._id),
    application: applied.body?.data?.id ?? String(new Types.ObjectId()),
    notification: notifications.body?.data?.[0]?.id ?? String(new Types.ObjectId()),
    feedback: feedback.body?.data?.id ?? String(new Types.ObjectId()),
    media: String(dish._id),
    admin: String(subAdmin.user._id),
  };
});

describe('route inventory', () => {
  it('mounts every route file and parses every route', () => {
    const files = (fs.readdirSync(SRC, { recursive: true }) as string[])
      .map((f) => f.replace(/\\/g, '/'))
      .filter((f) => f.endsWith('.route.ts') && f !== 'admin/admin.route.ts');
    expect(files.filter((f) => !(f in MOUNTS))).toEqual([]);
    expect(routes.length).toBeGreaterThanOrEqual(110);
  });
});

describe('every route', () => {
  it('rejects guests on protected routes with 401', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((route) => accessOf(route.middleware).auth)) {
      const res = await call(r.method, fill(r.path), 'guest');
      if (res.status !== 401) failures.push(`${r.method} ${r.path} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });

  it('rejects the wrong role or a missing permission with 403', async () => {
    const roleOf: Record<Identity, string> = {
      guest: '',
      candidate: 'candidate',
      employer: 'employer',
      subAdmin: 'admin',
      superAdmin: 'admin',
    };
    const failures: string[] = [];
    for (const r of routes) {
      const a = accessOf(r.middleware);
      const denied: Identity[] = [];
      if (a.perms.length) {
        denied.push('candidate', 'employer');
        if (!a.perms.every((p) => p === 'approve-photos')) denied.push('subAdmin');
      } else if (a.roles.length) {
        for (const id of ['candidate', 'employer', 'superAdmin'] as Identity[]) {
          if (!a.roles.includes(roleOf[id])) denied.push(id);
        }
      }
      for (const id of denied) {
        const res = await call(r.method, fill(r.path), id);
        if (res.status !== 403) failures.push(`${r.method} ${r.path} as ${id} -> ${res.status}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('never answers with a 5xx and always uses the response envelope', async () => {
    const failures: string[] = [];
    for (const r of routes) {
      for (const id of IDENTITIES) {
        const res = await call(r.method, fill(r.path), id);
        if (res.status >= 500) {
          failures.push(`${r.method} ${r.path} as ${id} -> ${res.status} ${res.body?.message ?? ''}`);
        } else if (
          res.type === 'application/json' &&
          (typeof res.body.success !== 'boolean' || res.body.statusCode !== res.status)
        ) {
          failures.push(`${r.method} ${r.path} as ${id} -> envelope mismatch on ${res.status}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('answers malformed and unknown ids with a client error', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((route) => /:(id|assetId)\b/.test(route.path))) {
      const id = allowedIdentity(r.middleware);
      for (const bad of ['not-an-id', String(new Types.ObjectId())]) {
        const res = await call(r.method, fill(r.path, bad), id);
        if (res.status < 400 || res.status >= 500) {
          failures.push(`${r.method} ${r.path} id=${bad === 'not-an-id' ? bad : 'unknown'} as ${id} -> ${res.status}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('survives hostile query strings on every GET route', async () => {
    const hostile =
      'page=-5&limit=abc&sort=__proto__&status[$ne]=x&q[$regex]=.*&verified=maybe&days=9999&read=perhaps';
    const failures: string[] = [];
    for (const r of routes.filter((route) => route.method === 'GET')) {
      const id = allowedIdentity(r.middleware);
      const res = await call(r.method, `${fill(r.path)}?${hostile}`, id);
      if (res.status >= 500) {
        failures.push(`${r.method} ${r.path} as ${id} -> ${res.status} ${res.body?.message ?? ''}`);
      }
    }
    expect(failures).toEqual([]);
  });

  it('rejects malformed JSON bodies with 400', async () => {
    const failures: string[] = [];
    for (const r of routes.filter((route) => ['POST', 'PUT', 'PATCH'].includes(route.method))) {
      const token = tokens[allowedIdentity(r.middleware)];
      const req = (request(app) as any)[r.method.toLowerCase()](fill(r.path));
      req.set('Content-Type', 'application/json');
      if (token) req.set('Authorization', `Bearer ${token}`);
      const res = await req.send('{"broken":');
      if (res.status !== 400) failures.push(`${r.method} ${r.path} -> ${res.status}`);
    }
    expect(failures).toEqual([]);
  });
});
