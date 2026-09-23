import { Types } from 'mongoose';
import type { FilterQuery } from '@/types/mongoose';
import { ApiError } from '@/shared/ApiError';
import { paginationMeta, QueryBuilder, textSearchFilter } from '@/shared/QueryBuilder';
import * as notificationService from '@/modules/notification/notification.service';
import { DEFAULT_FEEDBACK_LIMIT } from './feedback.constant';
import {
  AdminFeedbackListQuery,
  CreateFeedbackInput,
  IFeedbackDocument,
  ReplyFeedbackInput,
} from './feedback.interface';
import { User } from '@/modules/user/user.model';
import * as activityLogService from '@/modules/activityLog/activityLog.service';
import { Feedback } from './feedback.model';

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

export async function create(input: CreateFeedbackInput): Promise<IFeedbackDocument> {
  return Feedback.create({
    userId: toObjectId(input.userId),
    role: input.role,
    rating: input.rating,
    message: input.message.trim(),
    messages: [],
    status: 'new',
  });
}

export async function listAdmin(query: AdminFeedbackListQuery = {}): Promise<{
  data: Record<string, unknown>[];
  meta: ReturnType<typeof paginationMeta>;
}> {
  const filter: FilterQuery<IFeedbackDocument> = {};
  if (query.status) filter.status = query.status;
  if (query.role && query.role !== 'all') filter.role = query.role as IFeedbackDocument['role'];

  const byEmail = textSearchFilter(query.q, ['email']);
  const byMessage = textSearchFilter(query.q, ['message']);
  if (byEmail && byMessage) {
    const authors = await User.find(byEmail).select('_id').lean();
    (filter as Record<string, unknown>).$or = [
      ...byMessage.$or,
      { userId: { $in: authors.map((author: any) => author._id) } },
    ];
  }

  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(Math.max(1, Number(query.limit) || DEFAULT_FEEDBACK_LIMIT), 100);

  const modelQuery = Feedback.find(filter);
  const builder = new QueryBuilder<IFeedbackDocument>(modelQuery, query);
  builder.sort('-createdAt').paginate(DEFAULT_FEEDBACK_LIMIT);

  const [items, total] = await Promise.all([
    builder.query.exec(),
    Feedback.countDocuments(filter),
  ]);

  const userIds = items.map((f: IFeedbackDocument) => f.userId);
  const users = userIds.length
    ? await User.find({ _id: { $in: userIds } })
        .select('email')
        .lean()
    : [];
  const emailByUserId = new Map(users.map((u: any) => [String(u._id), u.email]));

  const data = items.map((feedback: IFeedbackDocument) => {
    const json = feedback.toJSON() as unknown as Record<string, unknown>;
    const email = emailByUserId.get(String(feedback.userId)) ?? '';
    json.from = email;
    json.user = { email };
    return json;
  });

  return { data, meta: paginationMeta(page, limit, total) };
}

export async function reply(
  id: string,
  input: ReplyFeedbackInput,
): Promise<IFeedbackDocument> {
  const feedback = await Feedback.findById(id);
  if (!feedback) {
    throw new ApiError(404, 'Feedback not found');
  }

  const body = input.body.trim();
  if (!body) {
    throw new ApiError(422, 'Reply body is required');
  }

  feedback.messages.push({
    authorUserId: toObjectId(input.adminUserId),
    body,
    at: new Date(),
    role: 'admin',
  });
  feedback.status = 'answered';
  await feedback.save();

  await activityLogService.log({
    actorUserId: input.adminUserId,
    actorLabel: 'Admin',
    action: 'feedback.replied',
    targetType: 'feedback',
    targetId: String(feedback._id),
    detail: {
      fr: 'Réponse envoyée au retour utilisateur',
      en: 'Reply sent to user feedback',
    },
  });

  await notificationService.notifyUser(
    String(feedback.userId),
    'feedback-reply',
    {
      fr: 'Réponse à votre retour',
      ar: 'جواب على ملاحظتكم',
      en: 'Reply to your feedback',
    },
    {
      fr: body,
      ar: body,
      en: body,
    },
    { feedbackId: String(feedback._id) },
  );

  return feedback;
}
