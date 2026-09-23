import { Types } from 'mongoose';
import { ApiError } from '@/shared/ApiError';
import { LocalizedString } from '@/shared/localizedString';
import { paginationMeta, QueryBuilder } from '@/shared/QueryBuilder';
import { DEFAULT_NOTIFICATION_LIMIT, NotificationType } from './notification.constant';
import {
  CreateNotificationInput,
  INotificationDocument,
  NotificationListQuery,
} from './notification.interface';
import { Notification } from './notification.model';

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

function ensureTrilingual(
  value: LocalizedString | { fr: string; ar?: string; en?: string },
): LocalizedString {
  return {
    fr: value.fr,
    ar: value.ar?.trim() || value.fr,
    en: value.en?.trim() || value.fr,
  };
}

export async function create(input: CreateNotificationInput): Promise<INotificationDocument> {
  return Notification.create({
    userId: toObjectId(input.userId),
    type: input.type,
    title: ensureTrilingual(input.title),
    body: ensureTrilingual(input.body),
    data: input.data ?? {},
    read: false,
    readAt: null,
    emailSentAt: null,
  });
}

export async function notifyUser(
  userId: string,
  type: NotificationType,
  title: LocalizedString | { fr: string; ar?: string; en?: string },
  body: LocalizedString | { fr: string; ar?: string; en?: string },
  data?: Record<string, unknown>,
): Promise<INotificationDocument> {
  return create({ userId, type, title, body, data });
}

export async function list(
  userId: string,
  query: NotificationListQuery = {},
): Promise<{ data: INotificationDocument[]; meta: ReturnType<typeof paginationMeta> }> {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || DEFAULT_NOTIFICATION_LIMIT), 100);

  const filter: Record<string, unknown> = { userId: toObjectId(userId) };
  if (query.read === 'true') filter.read = true;
  if (query.read === 'false') filter.read = false;

  const modelQuery = Notification.find(filter);
  const builder = new QueryBuilder<INotificationDocument>(modelQuery, query);
  builder.sort('-createdAt').paginate(DEFAULT_NOTIFICATION_LIMIT);

  const [data, total] = await Promise.all([
    builder.query.exec(),
    Notification.countDocuments(filter),
  ]);

  return { data, meta: paginationMeta(page, limit, total) };
}

export async function markRead(
  userId: string,
  notificationId: string,
): Promise<INotificationDocument> {
  const notification = await Notification.findOne({
    _id: notificationId,
    userId: toObjectId(userId),
  });

  if (!notification) {
    throw new ApiError(404, 'Notification not found');
  }

  if (!notification.read) {
    notification.read = true;
    notification.readAt = new Date();
    await notification.save();
  }

  return notification;
}

export async function markAllRead(userId: string): Promise<number> {
  const result = await Notification.updateMany(
    { userId: toObjectId(userId), read: false },
    { read: true, readAt: new Date() },
  );

  return result.modifiedCount;
}

export async function listEmailOutbox(limit = 100): Promise<INotificationDocument[]> {
  return Notification.find({ emailSentAt: null }).sort({ createdAt: 1 }).limit(limit);
}

export async function listAdminOutbox(limit = 100): Promise<Record<string, unknown>[]> {
  const { User } = await import('@/modules/user/user.model');

  const notifications = await Notification.find()
    .sort({ createdAt: -1 })
    .limit(Math.min(Math.max(1, limit), 200))
    .lean();

  const userIds = notifications.map((n: any) => n.userId);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select('email role')
        .lean()
    : [];
  const userById = new Map<string, { _id: unknown; email?: string }>(
    users.map((u: any) => [String(u._id), u]),
  );

  return notifications.map((n: any) => {
    const user = userById.get(String(n.userId));
    return {
      id: String(n._id),
      type: n.type,
      title: n.title,
      body: n.body,
      data: n.data,
      read: n.read,
      readAt: n.readAt,
      emailSentAt: n.emailSentAt,
      createdAt: n.createdAt,
      to: user
        ? {
            id: String(user._id),
            email: user.email,
            name: user.email?.split('@')[0],
          }
        : { id: String(n.userId) },
      emailQueued: n.emailSentAt == null,
    };
  });
}

export async function markEmailSent(ids: Types.ObjectId[] | string[]): Promise<number> {
  if (ids.length === 0) return 0;

  const result = await Notification.updateMany(
    { _id: { $in: ids.map((id) => toObjectId(id)) } },
    { emailSentAt: new Date() },
  );

  return result.modifiedCount;
}

const APPLICATION_STATUS_MESSAGES: Record<
  string,
  { title: LocalizedString; body: LocalizedString }
> = {
  pending: {
    title: {
      fr: 'Candidature envoyée',
      ar: 'تم إرسال الترشيح',
      en: 'Application submitted',
    },
    body: {
      fr: 'Votre candidature a bien été enregistrée.',
      ar: 'تم تسجيل ترشيحكم بنجاح.',
      en: 'Your application has been recorded.',
    },
  },
  shortlisted: {
    title: {
      fr: 'Candidature présélectionnée',
      ar: 'تم اختيار ترشيحكم',
      en: 'Application shortlisted',
    },
    body: {
      fr: 'Votre candidature a été présélectionnée par l\'employeur.',
      ar: 'تم اختيار ترشيحكم من قبل المشغّل.',
      en: 'Your application has been shortlisted by the employer.',
    },
  },
  rejected: {
    title: {
      fr: 'Candidature refusée',
      ar: 'تم رفض الترشيح',
      en: 'Application rejected',
    },
    body: {
      fr: 'Votre candidature n\'a pas été retenue pour cette offre.',
      ar: 'لم يتم الاحتفاظ بترشيحكم لهذا العرض.',
      en: 'Your application was not retained for this offer.',
    },
  },
  hired: {
    title: {
      fr: 'Candidature acceptée',
      ar: 'تم قبول الترشيح',
      en: 'Application accepted',
    },
    body: {
      fr: 'Félicitations — l\'employeur a retenu votre candidature.',
      ar: 'تهانينا — المشغّل قبل ترشيحكم.',
      en: 'Congratulations — the employer has accepted your application.',
    },
  },
};

export async function notifyApplicationStatusChange(
  application: {
    _id: Types.ObjectId;
    candidateId: Types.ObjectId;
    jobId: Types.ObjectId;
  },
  status: string,
): Promise<void> {
  try {
    const { CandidateProfile } = await import('@/modules/candidate/candidate.model');
    const candidate = await CandidateProfile.findById(application.candidateId);
    if (!candidate) return;

    const messages = APPLICATION_STATUS_MESSAGES[status];
    if (!messages) return;

    await notifyUser(
      String(candidate.userId),
      'application',
      messages.title,
      messages.body,
      {
        applicationId: String(application._id),
        jobId: String(application.jobId),
        status,
      },
    );
  } catch {
    // optional dependency chain
  }
}

type LocalizedText = { fr: string; ar: string; en: string };

function withReason(text: LocalizedText, reason?: string | null): LocalizedText {
  const trimmed = reason?.trim();
  if (!trimmed) return text;
  return {
    fr: `${text.fr} Motif : ${trimmed}`,
    ar: `${text.ar} السبب: ${trimmed}`,
    en: `${text.en} Reason: ${trimmed}`,
  };
}

async function notifySafely(
  resolveUserId: () => Promise<Types.ObjectId | string | null | undefined>,
  type: NotificationType,
  title: LocalizedText,
  body: LocalizedText,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const userId = await resolveUserId();
    if (!userId) return;
    await notifyUser(String(userId), type, title, body, data);
  } catch (err) {
    // The action that triggered this is already saved; a lost notification must not fail it.
    const { logger } = await import('@/config/logger');
    logger.error('Failed to create notification', { err, type, data });
  }
}

async function employerUserId(
  employerProfileId: Types.ObjectId | string,
): Promise<Types.ObjectId | null> {
  const { EmployerProfile } = await import('@/modules/employer/employer.model');
  const profile = await EmployerProfile.findById(employerProfileId).select('userId').lean();
  return profile?.userId ?? null;
}

export async function notifyJobDecision(
  job: { _id: unknown; employerId: Types.ObjectId; title?: { fr?: string } | null },
  decision: 'active' | 'rejected' | 'closed',
  reason?: string | null,
): Promise<void> {
  const name = job.title?.fr ?? '';
  const messages: Record<typeof decision, { title: LocalizedText; body: LocalizedText }> = {
    active: {
      title: { fr: 'Offre approuvée', ar: 'تمت الموافقة على العرض', en: 'Offer approved' },
      body: {
        fr: `Votre offre « ${name} » est maintenant publiée.`,
        ar: `تم نشر عرضكم « ${name} ».`,
        en: `Your offer "${name}" is now published.`,
      },
    },
    rejected: {
      title: { fr: 'Offre refusée', ar: 'تم رفض العرض', en: 'Offer rejected' },
      body: withReason(
        {
          fr: `Votre offre « ${name} » n'a pas été approuvée.`,
          ar: `لم تتم الموافقة على عرضكم « ${name} ».`,
          en: `Your offer "${name}" was not approved.`,
        },
        reason,
      ),
    },
    closed: {
      title: { fr: 'Offre clôturée', ar: 'تم إغلاق العرض', en: 'Offer closed' },
      body: {
        fr: `Votre offre « ${name} » a été clôturée par l'administration.`,
        ar: `تم إغلاق عرضكم « ${name} » من طرف الإدارة.`,
        en: `Your offer "${name}" was closed by the administration.`,
      },
    },
  };

  const { title, body } = messages[decision];
  await notifySafely(() => employerUserId(job.employerId), 'job', title, body, {
    jobId: String(job._id),
    status: decision,
  });
}

export async function notifyNewApplication(
  application: { _id: unknown; jobId: Types.ObjectId; employerId: Types.ObjectId },
  jobTitle?: string,
): Promise<void> {
  const name = jobTitle ?? '';
  await notifySafely(
    () => employerUserId(application.employerId),
    'application',
    { fr: 'Nouvelle candidature', ar: 'ترشيح جديد', en: 'New application' },
    {
      fr: `Vous avez reçu une nouvelle candidature pour « ${name} ».`,
      ar: `توصلتم بترشيح جديد لعرض « ${name} ».`,
      en: `You received a new application for "${name}".`,
    },
    { applicationId: String(application._id), jobId: String(application.jobId) },
  );
}

export async function notifyEmployerDecision(
  profile: { _id: unknown; userId: Types.ObjectId },
  status: 'active' | 'rejected',
  reason?: string | null,
): Promise<void> {
  const approved = status === 'active';
  await notifySafely(
    async () => profile.userId,
    'approval',
    approved
      ? { fr: 'Établissement approuvé', ar: 'تمت الموافقة على المؤسسة', en: 'Establishment approved' }
      : { fr: 'Établissement refusé', ar: 'تم رفض المؤسسة', en: 'Establishment rejected' },
    approved
      ? {
          fr: 'Votre établissement est approuvé : vous pouvez publier des offres.',
          ar: 'تمت الموافقة على مؤسستكم: يمكنكم الآن نشر العروض.',
          en: 'Your establishment is approved: you can now publish offers.',
        }
      : withReason(
          {
            fr: "Votre demande d'inscription n'a pas été acceptée.",
            ar: 'لم يتم قبول طلب التسجيل الخاص بكم.',
            en: 'Your registration request was not accepted.',
          },
          reason,
        ),
    { employerId: String(profile._id), status },
  );
}

export async function notifyEmployerBlocked(
  profile: { _id: unknown; userId: Types.ObjectId },
  reason?: string | null,
): Promise<void> {
  await notifySafely(
    async () => profile.userId,
    'system',
    { fr: 'Établissement bloqué', ar: 'تم حظر المؤسسة', en: 'Establishment blocked' },
    withReason(
      {
        fr: "Votre établissement a été bloqué par l'administration.",
        ar: 'تم حظر مؤسستكم من طرف الإدارة.',
        en: 'Your establishment was blocked by the administration.',
      },
      reason,
    ),
    { employerId: String(profile._id), status: 'blocked' },
  );
}

export async function notifyCandidateVerified(profile: {
  _id: unknown;
  userId: Types.ObjectId;
}): Promise<void> {
  await notifySafely(
    async () => profile.userId,
    'approval',
    { fr: 'Profil vérifié', ar: 'تم التحقق من الملف', en: 'Profile verified' },
    {
      fr: 'Votre profil a été vérifié par notre équipe.',
      ar: 'تم التحقق من ملفكم من طرف فريقنا.',
      en: 'Your profile has been verified by our team.',
    },
    { candidateId: String(profile._id) },
  );
}

export async function notifyPhotoRejected(
  asset: { _id: unknown; ownerUserId: Types.ObjectId; kind?: string },
  reason?: string | null,
): Promise<void> {
  await notifySafely(
    async () => asset.ownerUserId,
    'approval',
    { fr: 'Photo refusée', ar: 'تم رفض الصورة', en: 'Photo rejected' },
    withReason(
      {
        fr: 'Une de vos photos a été refusée. Merci de téléverser une photo conforme.',
        ar: 'تم رفض إحدى صوركم. المرجو رفع صورة مطابقة.',
        en: 'One of your photos was rejected. Please upload a compliant photo.',
      },
      reason,
    ),
    { mediaId: String(asset._id), kind: asset.kind },
  );
}
