import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import { env } from '../../src/config/env';
import { ALL_ADMIN_PERMISSIONS } from '../../src/modules/user/user.constant';
import { User } from '../../src/modules/user/user.model';
import { CandidateProfile } from '../../src/modules/candidate/candidate.model';
import { EmployerProfile } from '../../src/modules/employer/employer.model';
import { Job } from '../../src/modules/job/job.model';
import { Taxonomy } from '../../src/modules/taxonomy/taxonomy.model';
import { MediaAsset } from '../../src/modules/media/media.model';
import * as taxonomyService from '../../src/modules/taxonomy/taxonomy.service';

export const API = '/api/v1';

export type AnyDoc = any;

export function tokenFor(user: AnyDoc): string {
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

export async function makeUser(role: string, extra: Record<string, unknown> = {}): Promise<AnyDoc> {
  seq += 1;
  return User.create({
    email: `${role}${seq}@fixtures.test`,
    passwordHash: 'not-used',
    role,
    status: 'active',
    emailVerified: true,
    ...extra,
  });
}

export async function makeAdmin(
  permissions: string[] = [...ALL_ADMIN_PERMISSIONS],
  adminLevel: 'super' | 'sub' = 'super',
) {
  const user = await makeUser('admin', { adminLevel, permissions });
  return { user, token: tokenFor(user) };
}

export async function makeMedia(
  ownerUserId: Types.ObjectId,
  kind: string,
  extra: Record<string, unknown> = {},
) {
  seq += 1;
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

export async function makeEmployer(status = 'active') {
  const user = await makeUser('employer');
  const profile = await EmployerProfile.create({
    userId: user._id,
    name: 'Chez Fixtures',
    type: 'restaurant',
    city: 'casablanca',
    status,
    verified: status === 'active',
  });
  return { user, profile, token: tokenFor(user) };
}

export async function makeCandidate(overrides: Record<string, unknown> = {}) {
  const user = await makeUser('candidate');
  const photo = await makeMedia(user._id, 'profile-photo');
  const profile = await CandidateProfile.create({
    userId: user._id,
    firstName: 'Amina',
    lastName: 'Fixtures',
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

export const jobBody = {
  title: { fr: 'Chef de partie' },
  description: { fr: 'Cuisine marocaine traditionnelle' },
  sectorId: 'kitchen',
  positionId: 'head-chef',
  city: 'casablanca',
  contractType: 'cdi',
  experience: '1-3',
};

export async function makeJob(
  employerId: Types.ObjectId,
  status = 'active',
  extra: Record<string, unknown> = {},
) {
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

// setup.ts wipes every collection after each test, so call this from beforeEach.
export async function seedTaxonomy() {
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
}
