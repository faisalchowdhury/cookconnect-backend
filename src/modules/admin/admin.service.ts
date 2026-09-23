import { ApiError } from '@/shared/ApiError';
import { hashPassword } from '@/utils/crypto';
import * as activityLogService from '@/modules/activityLog/activityLog.service';
import * as userService from '@/modules/user/user.service';
import {
  ALL_ADMIN_PERMISSIONS,
  AdminPermission,
} from '@/modules/user/user.constant';
import { IUserDocument } from '@/modules/user/user.interface';
import { User } from '@/modules/user/user.model';

const PERMISSION_SET = new Set<string>(ALL_ADMIN_PERMISSIONS);

function sanitizePermissions(permissions: string[]): AdminPermission[] {
  return permissions.filter((p): p is AdminPermission => PERMISSION_SET.has(p));
}

export async function listAdmins(): Promise<IUserDocument[]> {
  return User.find({ role: 'admin', deletedAt: null }).sort({ createdAt: -1 });
}

export async function createAdmin(
  input: {
    email: string;
    password: string;
    permissions: string[];
  },
  actorUserId?: string,
): Promise<IUserDocument> {
  const existing = await userService.findByEmail(input.email);
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);

  const admin = await User.create({
    email: input.email.toLowerCase().trim(),
    passwordHash,
    role: 'admin',
    status: 'active',
    emailVerified: true,
    adminLevel: 'sub',
    permissions: sanitizePermissions(input.permissions),
  });

  await activityLogService.log({
    actorUserId,
    actorLabel: 'Admin',
    action: 'admin.created',
    targetType: 'admin',
    targetId: String(admin._id),
    detail: {
      fr: `Compte admin créé : ${admin.email}`,
      en: `Admin account created: ${admin.email}`,
    },
  });

  return admin;
}

export async function updateAdmin(
  targetId: string,
  input: { permissions?: string[]; status?: 'active' | 'suspended' },
  actor: { id: string; adminLevel?: 'super' | 'sub' | null; permissions: string[] },
): Promise<IUserDocument> {
  let admin: IUserDocument | null = null;

  if (input.permissions !== undefined) {
    admin = await updatePermissions(targetId, input.permissions, actor);
  }

  if (input.status === 'active') {
    admin = await enableAdmin(targetId, actor.id);
  }

  if (!admin) {
    throw new ApiError(422, 'No valid update fields provided');
  }

  return admin;
}

export async function updatePermissions(
  targetId: string,
  permissions: string[],
  actor: { id: string; adminLevel?: 'super' | 'sub' | null; permissions: string[] },
): Promise<IUserDocument> {
  const target = await User.findById(targetId);
  if (!target || target.role !== 'admin') {
    throw new ApiError(404, 'Admin account not found');
  }

  if (target.adminLevel === 'super') {
    throw new ApiError(403, 'Super admin permissions cannot be modified');
  }

  let next = sanitizePermissions(permissions);

  if (actor.adminLevel === 'sub' && actor.id === targetId) {
    const actorPermissions = new Set(actor.permissions);
    const illegal = next.some((permission) => !actorPermissions.has(permission));
    if (illegal) {
      throw new ApiError(403, 'You cannot grant yourself permissions you do not have');
    }
  }

  if (actor.adminLevel === 'sub' && actor.id !== targetId) {
    // A sub-admin only controls the rights they hold; the target keeps every other one.
    const actorPermissions = new Set(actor.permissions);
    const outOfScope = sanitizePermissions(target.permissions).filter(
      (permission) => !actorPermissions.has(permission),
    );
    next = [...next.filter((permission) => actorPermissions.has(permission)), ...outOfScope];
  }

  target.permissions = next;
  const saved = await target.save();

  await activityLogService.log({
    actorUserId: actor.id,
    actorLabel: 'Admin',
    action: 'admin.permissionsChanged',
    targetType: 'admin',
    targetId: String(saved._id),
    detail: {
      fr: `Permissions mises à jour pour ${saved.email}`,
      en: `Permissions updated for ${saved.email}`,
    },
  });

  return saved;
}

export async function enableAdmin(id: string, actorUserId?: string): Promise<IUserDocument> {
  const admin = await User.findById(id);
  if (!admin || admin.role !== 'admin') {
    throw new ApiError(404, 'Admin account not found');
  }

  if (admin.adminLevel === 'super') {
    throw new ApiError(403, 'Super admin status cannot be modified this way');
  }

  admin.status = 'active';
  const saved = await admin.save();

  if (actorUserId) {
    await activityLogService.log({
      actorUserId,
      actorLabel: 'Admin',
      action: 'admin.enabled',
      targetType: 'admin',
      targetId: String(saved._id),
      detail: {
        fr: `Compte admin réactivé : ${saved.email}`,
        en: `Admin account re-enabled: ${saved.email}`,
      },
    });
  }

  return saved;
}

export async function disableAdmin(id: string, actorUserId?: string): Promise<IUserDocument> {
  const admin = await User.findById(id);
  if (!admin || admin.role !== 'admin') {
    throw new ApiError(404, 'Admin account not found');
  }

  if (admin.adminLevel === 'super') {
    throw new ApiError(403, 'Super admin cannot be disabled');
  }

  admin.status = 'suspended';
  const saved = await admin.save();

  if (actorUserId) {
    await activityLogService.log({
      actorUserId,
      actorLabel: 'Admin',
      action: 'admin.disabled',
      targetType: 'admin',
      targetId: String(saved._id),
      detail: {
        fr: `Compte admin désactivé : ${saved.email}`,
        en: `Admin account disabled: ${saved.email}`,
      },
    });
  }

  return saved;
}

export async function findAdminById(id: string): Promise<IUserDocument> {
  const admin = await User.findById(id);
  if (!admin || admin.role !== 'admin') {
    throw new ApiError(404, 'Admin account not found');
  }
  return admin;
}
