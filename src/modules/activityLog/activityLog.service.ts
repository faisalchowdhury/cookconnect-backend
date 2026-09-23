import { Types } from 'mongoose';
import { IActivityLogDocument, LogActivityInput } from './activityLog.interface';
import { ActivityLog } from './activityLog.model';

function toObjectId(value: Types.ObjectId | string): Types.ObjectId {
  return typeof value === 'string' ? new Types.ObjectId(value) : value;
}

export async function log(input: LogActivityInput): Promise<IActivityLogDocument> {
  return ActivityLog.create({
    actorUserId: input.actorUserId ? toObjectId(input.actorUserId) : null,
    actorLabel: input.actorLabel,
    action: input.action,
    targetType: input.targetType,
    targetId: toObjectId(input.targetId),
    detail: input.detail,
    ip: input.ip,
    userAgent: input.userAgent,
  });
}

export function activityTypeFromAction(action: string): string {
  if (action.startsWith('contact.')) return 'contact-access';
  if (action.includes('photo')) return 'photo';
  return 'admin-action';
}

export function buildActivityListFilter(type?: string): Record<string, unknown> {
  if (!type || type === 'all') return {};

  if (type === 'admin' || type === 'admin-action') {
    return { action: { $not: { $regex: /^(contact|photo)/ } } };
  }
  if (type === 'contact-access') {
    return { action: { $regex: /^contact\./ } };
  }
  if (type === 'photo') {
    return { action: { $regex: /photo/ } };
  }

  return { action: type };
}
