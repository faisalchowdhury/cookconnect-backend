/**
 * Database seed — run with: npm run seed  (tsx src/seed/index.ts)
 *
 * Clears demo collections and inserts taxonomies, users, profiles, jobs,
 * site settings, banners, partners, feedback and notifications.
 */
import { Types } from 'mongoose';
import { connectDatabase, disconnectDatabase } from '@/config/database';
import { hashPassword } from '@/utils/crypto';
import { ALL_ADMIN_PERMISSIONS } from '@/modules/user/user.constant';
import { Taxonomy } from '@/modules/taxonomy/taxonomy.model';
import * as taxonomyService from '@/modules/taxonomy/taxonomy.service';
import { User } from '@/modules/user/user.model';
import { CandidateProfile } from '@/modules/candidate/candidate.model';
import { EmployerProfile } from '@/modules/employer/employer.model';
import { Job } from '@/modules/job/job.model';
import { Application } from '@/modules/application/application.model';
import { Notification } from '@/modules/notification/notification.model';
import { Feedback } from '@/modules/feedback/feedback.model';
import { Banner } from '@/modules/banner/banner.model';
import { Partner } from '@/modules/partner/partner.model';
import { SiteSettings } from '@/modules/siteSettings/siteSettings.model';
import { DEFAULT_SITE_SETTINGS, SITE_SETTINGS_DOC_ID } from '@/modules/siteSettings/siteSettings.constant';
import { Session } from '@/modules/auth/session.model';
import { OtpToken } from '@/modules/auth/otp.model';
import { OFFER_DURATION_DAYS } from '@/modules/job/job.constant';
import { MediaAsset } from '@/modules/media/media.model';

type Localized = { fr: string; ar: string; en: string };

const L = (fr: string, ar = fr, en = fr): Localized => ({ fr, ar, en });

const ADMIN_PASSWORD = 'Admin123!';
const DEMO_PASSWORD = 'Demo123!';

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

async function clearCollections(): Promise<void> {
  await Promise.all([
    Taxonomy.deleteMany({}),
    MediaAsset.deleteMany({}),
    User.deleteMany({}),
    CandidateProfile.deleteMany({}),
    EmployerProfile.deleteMany({}),
    Job.deleteMany({}),
    Application.deleteMany({}),
    Notification.deleteMany({}),
    Feedback.deleteMany({}),
    Banner.deleteMany({}),
    Partner.deleteMany({}),
    SiteSettings.deleteMany({}),
    Session.deleteMany({}),
    OtpToken.deleteMany({}),
  ]);
}

async function seedTaxonomies(): Promise<void> {
  const sectors = [
    { key: 'kitchen', label: L('Cuisine', 'الطبخ', 'Kitchen'), order: 1 },
    { key: 'bakery', label: L('Boulangerie', 'المخبزة', 'Bakery'), order: 2 },
    { key: 'pastry', label: L('Pâtisserie', 'الحلويات', 'Pastry'), order: 3 },
    { key: 'service', label: L('Service / Salle', 'الخدمة', 'Service'), order: 4 },
  ];

  const positions: Array<{
    key: string;
    parentKey: string;
    label: Localized;
    order: number;
    allowsFoodPhotos: boolean;
  }> = [
    { key: 'head-chef', parentKey: 'kitchen', label: L('Chef de cuisine', 'شيف دكوزينة', 'Head Chef'), order: 1, allowsFoodPhotos: true },
    { key: 'sous-chef', parentKey: 'kitchen', label: L('Sous-chef', 'سو شيف', 'Sous Chef'), order: 2, allowsFoodPhotos: true },
    { key: 'chef-de-partie', parentKey: 'kitchen', label: L('Chef de partie', 'شيف دي بارتي', 'Chef de Partie'), order: 3, allowsFoodPhotos: true },
    { key: 'cook', parentKey: 'kitchen', label: L('Cuisinier', 'طباخ', 'Cook'), order: 4, allowsFoodPhotos: true },
    { key: 'kitchen-commis', parentKey: 'kitchen', label: L('Commis de cuisine', 'كومي دكوزينة', 'Kitchen Commis'), order: 5, allowsFoodPhotos: true },
    { key: 'head-baker', parentKey: 'bakery', label: L('Chef boulanger', 'شيف بولانجي', 'Head Baker'), order: 1, allowsFoodPhotos: true },
    { key: 'baker', parentKey: 'bakery', label: L('Boulanger', 'خباز', 'Baker'), order: 2, allowsFoodPhotos: true },
    { key: 'viennoisier', parentKey: 'bakery', label: L('Viennoisier', 'فيينوازيي', 'Viennoiserie Baker'), order: 3, allowsFoodPhotos: true },
    { key: 'pastry-chef', parentKey: 'pastry', label: L('Pâtissier', 'باتيسيي', 'Pastry Chef'), order: 1, allowsFoodPhotos: true },
    { key: 'chocolatier', parentKey: 'pastry', label: L('Chocolatier', 'شوكولاتيي', 'Chocolatier'), order: 2, allowsFoodPhotos: true },
    { key: 'pastry-assistant', parentKey: 'pastry', label: L('Aide-pâtissier', 'معاون الباتيسيي', 'Pastry Assistant'), order: 3, allowsFoodPhotos: true },
    { key: 'waiter', parentKey: 'service', label: L('Serveur', 'سيرفور', 'Waiter'), order: 1, allowsFoodPhotos: false },
    { key: 'head-waiter', parentKey: 'service', label: L('Maître d\'hôtel', 'مaitre d\'hôtel', 'Head Waiter'), order: 2, allowsFoodPhotos: false },
    { key: 'bartender', parentKey: 'service', label: L('Barman', 'بارمان', 'Bartender'), order: 3, allowsFoodPhotos: false },
    { key: 'receptionist', parentKey: 'service', label: L('Réceptionniste', 'ريسبسيونيست', 'Receptionist'), order: 4, allowsFoodPhotos: false },
  ];

  const cities = [
    { key: 'casablanca', label: L('Casablanca', 'الدار البيضاء', 'Casablanca'), order: 1 },
    { key: 'rabat', label: L('Rabat', 'الرباط', 'Rabat'), order: 2 },
    { key: 'marrakech', label: L('Marrakech', 'مراكش', 'Marrakech'), order: 3 },
    { key: 'tangier', label: L('Tanger', 'طنجة', 'Tangier'), order: 4 },
    { key: 'fes', label: L('Fès', 'فاس', 'Fes'), order: 5 },
  ];

  const contractTypes = [
    { key: 'cdi', label: L('CDI', 'عقد دائم', 'Permanent'), order: 1 },
    { key: 'cdd', label: L('CDD', 'عقد محدد', 'Fixed-term'), order: 2 },
    { key: 'interim', label: L('Intérim', 'مؤقت', 'Temporary'), order: 3 },
    { key: 'stage', label: L('Stage', 'تدريب', 'Internship'), order: 4 },
    { key: 'unspecified', label: L('Non précisé', 'غير محدد', 'Unspecified'), order: 5 },
  ];

  const experienceLevels = [
    { key: '0-1', label: L('0–1 an', '0–1 عام', '0–1 year'), order: 1 },
    { key: '1-3', label: L('1–3 ans', '1–3 سنوات', '1–3 years'), order: 2 },
    { key: '3-5', label: L('3–5 ans', '3–5 سنوات', '3–5 years'), order: 3 },
    { key: '5-10', label: L('5–10 ans', '5–10 سنوات', '5–10 years'), order: 4 },
    { key: '10+', label: L('10+ ans', '10+ سنوات', '10+ years'), order: 5 },
  ];

  const availability = [
    { key: 'immediate', label: L('Immédiate', 'فوري', 'Immediate'), order: 1 },
    { key: '1-month', label: L('Sous 1 mois', 'شهر', 'Within 1 month'), order: 2 },
    { key: '3-months', label: L('Sous 3 mois', '3 أشهر', 'Within 3 months'), order: 3 },
  ];

  const skills = [
    { key: 'moroccan-cuisine', label: L('Cuisine marocaine', 'الطبخ المغربي', 'Moroccan cuisine'), order: 1 },
    { key: 'international-cuisine', label: L('Cuisine internationale', 'الطبخ العالمي', 'International cuisine'), order: 2 },
    { key: 'haccp', label: L('HACCP', 'HACCP', 'HACCP'), order: 3 },
    { key: 'food-hygiene', label: L('Hygiène alimentaire', 'النظافة الغذائية', 'Food hygiene'), order: 4 },
    { key: 'bakery-pastry', label: L('Boulangerie / pâtisserie', 'المخبزة والحلويات', 'Bakery / pastry'), order: 5 },
    { key: 'management', label: L('Management', 'التسيير', 'Management'), order: 6 },
  ];

  const requirements = [
    { key: 'immediate', label: L('Disponible immédiatement', 'متوفر دابا', 'Available immediately'), order: 1 },
    { key: 'moroccan-cuisine', label: L('Cuisine marocaine', 'الطبخ المغربي', 'Moroccan cuisine'), order: 2 },
    { key: 'haccp', label: L('Connaissance HACCP', 'معرفة HACCP', 'HACCP knowledge'), order: 3 },
    { key: 'french', label: L('Français', 'الفرنسية', 'French'), order: 4 },
    { key: 'diploma', label: L('Diplôme', 'ديبلوم', 'Diploma'), order: 5 },
  ];

  const benefits = [
    { key: 'fixed-salary', label: L('Salaire fixe', 'أجرة قارة', 'Fixed salary'), order: 1 },
    { key: 'cnss', label: L('CNSS', 'CNSS', 'Social security'), order: 2 },
    { key: 'meals', label: L('Repas', 'وجبات', 'Meals'), order: 3 },
    { key: 'paid-leave', label: L('Congés payés', 'عطلة مدفوعة', 'Paid leave'), order: 4 },
    { key: 'transport', label: L('Transport', 'النقل', 'Transport'), order: 5 },
  ];

  const establishmentTypes = [
    { key: 'restaurant', label: L('Restaurant', 'مطعم', 'Restaurant'), order: 1 },
    { key: 'hotel', label: L('Hôtel', 'فندق', 'Hotel'), order: 2 },
    { key: 'bakery', label: L('Boulangerie', 'مخبزة', 'Bakery'), order: 3 },
    { key: 'cafe', label: L('Café', 'مقهى', 'Café'), order: 4 },
    { key: 'catering', label: L('Traiteur', 'خدمات التموين', 'Catering'), order: 5 },
  ];

  const docs = [
    ...sectors.map((s) => ({ type: 'sector', key: s.key, label: s.label, order: s.order, parentKey: null, meta: {} })),
    ...positions.map((p) => ({
      type: 'position',
      key: p.key,
      label: p.label,
      order: p.order,
      parentKey: p.parentKey,
      meta: { allowsFoodPhotos: p.allowsFoodPhotos },
    })),
    ...cities.map((c) => ({ type: 'city', key: c.key, label: c.label, order: c.order, parentKey: null, meta: {} })),
    ...contractTypes.map((c) => ({ type: 'contract-type', key: c.key, label: c.label, order: c.order, parentKey: null, meta: {} })),
    ...experienceLevels.map((e) => ({ type: 'experience-level', key: e.key, label: e.label, order: e.order, parentKey: null, meta: {} })),
    ...availability.map((a) => ({ type: 'availability', key: a.key, label: a.label, order: a.order, parentKey: null, meta: {} })),
    ...skills.map((s) => ({ type: 'skill', key: s.key, label: s.label, order: s.order, parentKey: null, meta: {} })),
    ...requirements.map((r) => ({ type: 'requirement', key: r.key, label: r.label, order: r.order, parentKey: null, meta: {} })),
    ...benefits.map((b) => ({ type: 'benefit', key: b.key, label: b.label, order: b.order, parentKey: null, meta: {} })),
    ...establishmentTypes.map((e) => ({ type: 'establishment-type', key: e.key, label: e.label, order: e.order, parentKey: null, meta: {} })),
  ];

  await Taxonomy.insertMany(docs);
}

async function seedUsers(): Promise<{
  admins: Types.ObjectId[];
  candidates: Array<{ userId: Types.ObjectId; email: string }>;
  employers: Array<{ userId: Types.ObjectId; email: string }>;
}> {
  const adminHash = await hashPassword(ADMIN_PASSWORD);
  const demoHash = await hashPassword(DEMO_PASSWORD);

  const adminDocs = [
    {
      email: 'admin@nkhedmou.ma',
      passwordHash: adminHash,
      role: 'admin',
      status: 'active',
      emailVerified: true,
      adminLevel: 'super',
      permissions: [...ALL_ADMIN_PERMISSIONS],
      locale: 'fr',
    },
    {
      email: 'moderation@nkhedmou.ma',
      passwordHash: adminHash,
      role: 'admin',
      status: 'active',
      emailVerified: true,
      adminLevel: 'sub',
      permissions: ['approve-photos'],
      locale: 'fr',
    },
    {
      email: 'offres@nkhedmou.ma',
      passwordHash: adminHash,
      role: 'admin',
      status: 'active',
      emailVerified: true,
      adminLevel: 'sub',
      permissions: ['approve-offers', 'manage-employers'],
      locale: 'fr',
    },
  ];

  const candidateEmails = [
    'youssef.elamrani@example.ma',
    'fatima.bennani@example.ma',
    'karim.ouazzani@example.ma',
    'salma.idrissi@example.ma',
    'mehdi.tazi@example.ma',
    'nadia.chraibi@example.ma',
    'omar.berrada@example.ma',
    'imane.fassi@example.ma',
  ];

  const employerEmails = [
    'pending@restaurant-demo.ma',
    'rh@tablecasa.ma',
    'hr@hotelatlas.ma',
    'contact@boulangerie-maroc.ma',
  ];

  const candidateUsers = candidateEmails.map((email) => ({
    email,
    passwordHash: demoHash,
    role: 'candidate',
    status: 'active',
    emailVerified: true,
    locale: 'fr',
  }));

  const employerUsers = employerEmails.map((email) => ({
    email,
    passwordHash: demoHash,
    role: 'employer',
    status: 'active',
    emailVerified: true,
    locale: 'fr',
  }));

  const insertedAdmins = await User.insertMany(adminDocs);
  const insertedCandidates = await User.insertMany(candidateUsers);
  const insertedEmployers = await User.insertMany(employerUsers);

  return {
    admins: insertedAdmins.map((u: { _id: Types.ObjectId }) => u._id),
    candidates: insertedCandidates.map((u: { _id: Types.ObjectId; email: string }) => ({
      userId: u._id,
      email: u.email,
    })),
    employers: insertedEmployers.map((u: { _id: Types.ObjectId; email: string }) => ({
      userId: u._id,
      email: u.email,
    })),
  };
}

async function seedCandidateProfiles(
  candidates: Array<{ userId: Types.ObjectId; email: string }>,
  superAdminId: Types.ObjectId,
): Promise<Types.ObjectId[]> {
  const profiles = [
    { firstName: 'Youssef', lastName: 'El Amrani', sectorId: 'kitchen', positionId: 'head-chef', city: 'casablanca', experience: '5-10', availability: 'immediate', verified: true, complete: true },
    { firstName: 'Fatima', lastName: 'Bennani', sectorId: 'pastry', positionId: 'pastry-chef', city: 'rabat', experience: '3-5', availability: '1-month', verified: true, complete: true },
    { firstName: 'Karim', lastName: 'Ouazzani', sectorId: 'kitchen', positionId: 'sous-chef', city: 'marrakech', experience: '3-5', availability: 'immediate', verified: false, complete: true },
    { firstName: 'Salma', lastName: 'Idrissi', sectorId: 'service', positionId: 'waiter', city: 'tangier', experience: '0-1', availability: '', verified: false, complete: false },
    { firstName: 'Mehdi', lastName: 'Tazi', sectorId: 'bakery', positionId: 'baker', city: 'fes', experience: '1-3', availability: 'immediate', verified: true, complete: true },
    { firstName: 'Nadia', lastName: 'Chraibi', sectorId: 'kitchen', positionId: 'chef-de-partie', city: 'casablanca', experience: '1-3', availability: '1-month', verified: false, complete: true },
    { firstName: 'Omar', lastName: 'Berrada', sectorId: 'pastry', positionId: 'chocolatier', city: 'rabat', experience: '5-10', availability: 'immediate', verified: true, complete: true },
    { firstName: 'Imane', lastName: 'Fassi', sectorId: 'service', positionId: 'receptionist', city: 'marrakech', experience: '1-3', availability: '3-months', verified: true, complete: true },
  ];

  const seedPhotoUrls = [
    'https://i.ibb.co/HD6WMnhg/Rectangle-119.png',
    'https://i.ibb.co/j9Wwj0H0/Rectangle-116.png',
  ];

  const ids: Types.ObjectId[] = [];

  for (let i = 0; i < candidates.length; i += 1) {
    const seed = profiles[i];
    // A bare ObjectId with no MediaAsset behind it resolves to photoUrl: null everywhere.
    const photo = seed.complete
      ? await MediaAsset.create({
          ownerUserId: candidates[i].userId,
          kind: 'profile-photo',
          storageKey: `seed/candidate-${i + 1}.png`,
          url: seedPhotoUrls[i % seedPhotoUrls.length],
          mimeType: 'image/png',
          sizeBytes: 0,
          moderationStatus: 'approved',
          reviewedBy: superAdminId,
          reviewedAt: new Date(),
        })
      : null;
    const photoId = photo?._id ?? null;

    const doc = await CandidateProfile.create({
      userId: candidates[i].userId,
      firstName: seed.firstName,
      lastName: seed.lastName,
      photoId,
      sectorId: seed.sectorId,
      positionId: seed.positionId,
      city: seed.city,
      country: 'MA',
      experience: seed.experience || '',
      availability: seed.availability || '',
      contractType: 'cdi',
      expectedSalary: 5000 + i * 800,
      phone: seed.complete ? `+212 6 12 34 56 ${String(10 + i).padStart(2, '0')}` : '',
      about: L(
        `${seed.firstName} ${seed.lastName} — profil professionnel.`,
        `${seed.firstName} ${seed.lastName} — ملف مهني.`,
        `${seed.firstName} ${seed.lastName} — professional profile.`,
      ),
      skills: ['moroccan-cuisine', 'haccp', 'french'].slice(0, 2 + (i % 2)),
      languages: ['french', 'arabic'],
      verified: seed.verified,
      verifiedAt: seed.verified ? new Date() : null,
      verifiedBy: seed.verified ? superAdminId : null,
      searchable: seed.complete,
      profileViews: 20 + i * 11,
    });

    ids.push(doc._id as Types.ObjectId);
  }

  return ids;
}

async function seedEmployerProfiles(
  employers: Array<{ userId: Types.ObjectId; email: string }>,
  superAdminId: Types.ObjectId,
): Promise<Types.ObjectId[]> {
  const profiles = [
    { name: 'Nouveau Restaurant Demo', type: 'restaurant', city: 'casablanca', status: 'pending', verified: false },
    { name: 'La Table Casablancaise', type: 'restaurant', city: 'casablanca', status: 'active', verified: true },
    { name: 'Hôtel Atlas Rabat', type: 'hotel', city: 'rabat', status: 'active', verified: true },
    { name: 'Boulangerie du Maroc', type: 'bakery', city: 'fes', status: 'active', verified: true },
  ];

  const ids: Types.ObjectId[] = [];

  for (let i = 0; i < employers.length; i += 1) {
    const seed = profiles[i];
    const doc = await EmployerProfile.create({
      userId: employers[i].userId,
      name: seed.name,
      type: seed.type,
      city: seed.city,
      address: `${seed.city} centre-ville`,
      about: L(`${seed.name} — établissement au Maroc.`, `${seed.name} — مؤسسة بالمغرب.`, `${seed.name} — establishment in Morocco.`),
      phone: '+212 5 22 33 44 55',
      phonePublic: true,
      status: seed.status,
      verified: seed.verified,
      reviewedBy: seed.verified ? superAdminId : null,
      reviewedAt: seed.verified ? new Date() : null,
      since: '2018',
      staffCount: '20-50',
    });
    ids.push(doc._id as Types.ObjectId);
  }

  return ids;
}

async function seedJobs(
  employerIds: Types.ObjectId[],
  superAdminId: Types.ObjectId,
): Promise<Types.ObjectId[]> {
  const now = new Date();
  const activeEmployerIds = employerIds.slice(1);

  const jobSeeds: Array<{
    employerIdx: number;
    sectorId: string;
    positionId: string;
    city: string;
    status: 'pending' | 'active' | 'expired' | 'rejected' | 'closed';
    contractType: string;
    experience: string;
    salaryMin: number;
    salaryMax: number;
  }> = [
    { employerIdx: 0, sectorId: 'kitchen', positionId: 'head-chef', city: 'casablanca', status: 'active', contractType: 'cdi', experience: '5-10', salaryMin: 12000, salaryMax: 16000 },
    { employerIdx: 0, sectorId: 'kitchen', positionId: 'sous-chef', city: 'casablanca', status: 'active', contractType: 'cdi', experience: '3-5', salaryMin: 8000, salaryMax: 11000 },
    { employerIdx: 0, sectorId: 'service', positionId: 'waiter', city: 'casablanca', status: 'pending', contractType: 'interim', experience: '0-1', salaryMin: 3500, salaryMax: 4500 },
    { employerIdx: 1, sectorId: 'service', positionId: 'receptionist', city: 'rabat', status: 'active', contractType: 'cdi', experience: '1-3', salaryMin: 5000, salaryMax: 6500 },
    { employerIdx: 1, sectorId: 'kitchen', positionId: 'chef-de-partie', city: 'rabat', status: 'pending', contractType: 'cdd', experience: '3-5', salaryMin: 7000, salaryMax: 9500 },
    { employerIdx: 2, sectorId: 'pastry', positionId: 'pastry-chef', city: 'fes', status: 'active', contractType: 'cdi', experience: '3-5', salaryMin: 6000, salaryMax: 8000 },
    { employerIdx: 2, sectorId: 'bakery', positionId: 'baker', city: 'fes', status: 'expired', contractType: 'cdd', experience: '1-3', salaryMin: 5500, salaryMax: 7000 },
    { employerIdx: 0, sectorId: 'kitchen', positionId: 'cook', city: 'marrakech', status: 'rejected', contractType: 'cdi', experience: '1-3', salaryMin: 5500, salaryMax: 7000 },
    { employerIdx: 1, sectorId: 'service', positionId: 'bartender', city: 'tangier', status: 'closed', contractType: 'interim', experience: '1-3', salaryMin: 4500, salaryMax: 5500 },
    { employerIdx: 2, sectorId: 'pastry', positionId: 'chocolatier', city: 'marrakech', status: 'active', contractType: 'cdi', experience: '5-10', salaryMin: 7500, salaryMax: 9500 },
  ];

  const ids: Types.ObjectId[] = [];

  for (const seed of jobSeeds) {
    const employerId = activeEmployerIds[seed.employerIdx % activeEmployerIds.length];
    const postedAt =
      seed.status === 'active' || seed.status === 'expired'
        ? addDays(now, seed.status === 'expired' ? -65 : -(5 + ids.length * 3))
        : null;
    const expiresAt =
      postedAt && seed.status !== 'rejected'
        ? addDays(postedAt, OFFER_DURATION_DAYS)
        : null;

    const titleFr = `Poste ${seed.positionId.replace(/-/g, ' ')}`;
    const doc = await Job.create({
      employerId,
      title: L(titleFr, titleFr, titleFr),
      description: L(
        `Offre pour ${titleFr} à ${seed.city}.`,
        `عرض ل${titleFr} في ${seed.city}.`,
        `Offer for ${titleFr} in ${seed.city}.`,
      ),
      sectorId: seed.sectorId,
      positionId: seed.positionId,
      city: seed.city,
      country: 'MA',
      contractType: seed.contractType,
      salaryMin: seed.salaryMin,
      salaryMax: seed.salaryMax,
      experience: seed.experience,
      requirements: ['immediate', 'haccp', 'french'],
      benefits: ['fixed-salary', 'cnss', 'meals'],
      status: seed.status,
      postedAt,
      expiresAt,
      approvedBy: seed.status === 'active' || seed.status === 'expired' ? superAdminId : null,
      approvedAt: seed.status === 'active' || seed.status === 'expired' ? postedAt : null,
      rejectionReason: seed.status === 'rejected' ? 'incomplete-description' : null,
      viewCount: 10 + ids.length * 7,
      applicationCount: 0,
    });

    ids.push(doc._id as Types.ObjectId);
  }

  return ids;
}

async function seedApplications(
  candidateIds: Types.ObjectId[],
  jobIds: Types.ObjectId[],
  employerIds: Types.ObjectId[],
): Promise<number> {
  const activeJob = await Job.findOne({ status: 'active' });
  if (!activeJob || candidateIds.length < 2) return 0;

  await Application.create({
    jobId: activeJob._id,
    candidateId: candidateIds[0],
    employerId: activeJob.employerId,
    status: 'shortlisted',
    appliedAt: addDays(new Date(), -5),
    timeline: [{ status: 'shortlisted', at: addDays(new Date(), -2), note: null }],
  });

  await Application.create({
    jobId: jobIds[1],
    candidateId: candidateIds[1],
    employerId: employerIds[1],
    status: 'pending',
    appliedAt: addDays(new Date(), -3),
    timeline: [{ status: 'pending', at: addDays(new Date(), -3), note: null }],
  });

  activeJob.applicationCount = 1;
  await activeJob.save();

  const job2 = await Job.findById(jobIds[1]);
  if (job2) {
    job2.applicationCount = 1;
    await job2.save();
  }

  return 2;
}

async function seedSiteSettings(): Promise<void> {
  await SiteSettings.create({
    _id: SITE_SETTINGS_DOC_ID,
    ...DEFAULT_SITE_SETTINGS,
  });
}

async function seedBanners(): Promise<number> {
  await Banner.insertMany([
    {
      placement: 'home-middle',
      title: L('Recrutez les meilleurs talents', 'وظّف أفضل المواهب', 'Hire the best talent'),
      subtitle: L('Publiez votre offre dès aujourd\'hui', 'انشر عرضك اليوم', 'Post your offer today'),
      cta: L('Publier une offre', 'انشر عرض', 'Post an offer'),
      href: '/jobPost',
      order: 1,
      active: true,
    },
    {
      placement: 'home-bottom',
      title: L('Complétez votre profil', 'كمّل البروفيل ديالك', 'Complete your profile'),
      subtitle: L('Soyez visible par les employeurs', 'خلّي المشغّلين يشوفوك', 'Get noticed by employers'),
      cta: L('Mon profil', 'البروفيل ديالي', 'My profile'),
      href: '/editProfile',
      order: 2,
      active: true,
    },
  ]);
  return 2;
}

async function seedPartners(): Promise<number> {
  await Partner.insertMany([
    { name: 'OFPPT', href: 'https://www.ofppt.ma', order: 1, active: true },
    { name: 'AHRM', href: 'https://www.ahrm.ma', order: 2, active: true },
    { name: 'Maroc Hospitality', href: 'https://example.com', order: 3, active: true },
  ]);
  return 3;
}

async function seedFeedback(
  candidateUserId: Types.ObjectId,
  employerUserId: Types.ObjectId,
): Promise<number> {
  await Feedback.insertMany([
    {
      userId: candidateUserId,
      role: 'candidate',
      rating: 5,
      message: 'Plateforme très intuitive, merci !',
      status: 'new',
    },
    {
      userId: employerUserId,
      role: 'employer',
      rating: 4,
      message: 'Bon service, j\'attends plus de candidats à Tanger.',
      status: 'answered',
      messages: [],
    },
  ]);
  return 2;
}

async function seedNotifications(
  candidateUserIds: Types.ObjectId[],
  employerUserIds: Types.ObjectId[],
): Promise<number> {
  await Notification.insertMany([
    {
      userId: candidateUserIds[0],
      type: 'approval',
      title: L('Profil validé', 'البروفيل تصادق عليه', 'Profile approved'),
      body: L(
        'Votre profil est visible par les employeurs.',
        'البروفيل ديالك كيبان للمشغّلين.',
        'Your profile is visible to employers.',
      ),
      read: false,
    },
    {
      userId: candidateUserIds[0],
      type: 'job',
      title: L('Nouvelles offres', 'عروض جداد', 'New offers'),
      body: L('3 offres correspondent à votre profil.', '3 عروض كيتناسبو معاك.', '3 offers match your profile.'),
      read: false,
    },
    {
      userId: employerUserIds[1],
      type: 'application',
      title: L('Nouvelle candidature', 'ترشيح جديد', 'New application'),
      body: L('Un candidat a postulé à votre offre.', 'ترشّح واحد للعرض ديالك.', 'A candidate applied to your offer.'),
      read: true,
      readAt: new Date(),
    },
  ]);
  return 3;
}

async function main(): Promise<void> {
  console.log('Connecting to MongoDB…');
  await connectDatabase();

  console.log('Clearing collections…');
  await clearCollections();

  console.log('Seeding taxonomies…');
  await seedTaxonomies();

  console.log('Seeding users…');
  const { admins, candidates, employers } = await seedUsers();

  console.log('Seeding candidate profiles…');
  const candidateProfileIds = await seedCandidateProfiles(candidates, admins[0]);

  console.log('Seeding employer profiles…');
  const employerProfileIds = await seedEmployerProfiles(employers, admins[0]);

  console.log('Seeding jobs…');
  const jobIds = await seedJobs(employerProfileIds, admins[0]);

  console.log('Seeding applications…');
  const applicationCount = await seedApplications(candidateProfileIds, jobIds, employerProfileIds);

  console.log('Seeding site settings…');
  await seedSiteSettings();

  const bannerCount = await seedBanners();
  const partnerCount = await seedPartners();
  const feedbackCount = await seedFeedback(candidates[0].userId, employers[1].userId);
  const notificationCount = await seedNotifications(
    candidates.map((c) => c.userId),
    employers.map((e) => e.userId),
  );

  console.log('Loading taxonomy cache…');
  await taxonomyService.loadCache();

  const counts = {
    taxonomies: await Taxonomy.countDocuments(),
    users: await User.countDocuments(),
    candidates: await CandidateProfile.countDocuments(),
    employers: await EmployerProfile.countDocuments(),
    jobs: await Job.countDocuments(),
    applications: applicationCount,
    banners: bannerCount,
    partners: partnerCount,
    feedback: feedbackCount,
    notifications: notificationCount,
    siteSettings: await SiteSettings.countDocuments(),
  };

  console.log('\nSeed complete.');
  console.log('Summary:', counts);
  console.log('\nAdmin login: admin@nkhedmou.ma / Admin123!');
  console.log('Moderation:  moderation@nkhedmou.ma / Admin123!');
  console.log('Offers:      offres@nkhedmou.ma / Admin123!');
  console.log('Demo users:  candidate/employer emails above / Demo123!');
  console.log(`Today (reference): ${isoDate(new Date())}`);

  await disconnectDatabase();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
