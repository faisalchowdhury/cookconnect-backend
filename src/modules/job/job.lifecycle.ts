import { ApiError } from '@/shared/ApiError';
import { JobStatus } from './job.constant';

export type JobTransitionAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'close'
  | 'expire'
  | 'republish'
  | 'editActive';

type TransitionRule = {
  from: JobStatus | JobStatus[];
  to: JobStatus;
};

/** Testable map of allowed lifecycle transitions. */
export const JOB_TRANSITION_MAP: Record<JobTransitionAction, TransitionRule> = {
  submit: { from: 'draft', to: 'pending' },
  approve: { from: 'pending', to: 'active' },
  reject: { from: 'pending', to: 'rejected' },
  close: { from: 'active', to: 'closed' },
  expire: { from: 'active', to: 'expired' },
  republish: { from: 'expired', to: 'pending' },
  editActive: { from: 'active', to: 'pending' },
};

function allowedFromStatuses(action: JobTransitionAction): JobStatus[] {
  const rule = JOB_TRANSITION_MAP[action];
  return Array.isArray(rule.from) ? rule.from : [rule.from];
}

export function canTransition(from: JobStatus, action: JobTransitionAction): boolean {
  return allowedFromStatuses(action).includes(from);
}

export function getTransitionTarget(action: JobTransitionAction): JobStatus {
  return JOB_TRANSITION_MAP[action].to;
}

export function assertTransition(from: JobStatus, action: JobTransitionAction): JobStatus {
  if (!canTransition(from, action)) {
    throw new ApiError(409, `Cannot ${action} job from status "${from}"`);
  }
  return getTransitionTarget(action);
}

export function getEffectiveExpiry(
  expiresAt: Date | null | undefined,
  extendedUntil: Date | null | undefined,
): Date | null {
  if (!expiresAt && !extendedUntil) return null;
  if (!expiresAt) return extendedUntil ?? null;
  if (!extendedUntil) return expiresAt;
  return new Date(Math.max(expiresAt.getTime(), extendedUntil.getTime()));
}
