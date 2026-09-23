import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { ALL_ADMIN_PERMISSIONS, UserRole } from '@/modules/user/user.constant';
import { ApiError } from '@/shared/ApiError';

type AccessTokenPayload = {
  userId: string;
  role: UserRole;
  permissions: string[];
  adminLevel?: 'super' | 'sub' | null;
  email?: string;
};

function extractBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice(7).trim() || null;
}

function attachUser(req: Request, payload: AccessTokenPayload): void {
  req.user = {
    id: payload.userId,
    role: payload.role,
    permissions: payload.permissions ?? [],
    adminLevel: payload.adminLevel ?? null,
    email: payload.email,
  };
}

function verifyBearerToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function auth() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearerToken(req);
    if (!token) {
      next(new ApiError(401, 'Authentication required'));
      return;
    }

    try {
      attachUser(req, verifyBearerToken(token));
      next();
    } catch {
      next(new ApiError(401, 'Invalid or expired access token'));
    }
  };
}

export function authOptional() {
  return (req: Request, _res: Response, next: NextFunction) => {
    const token = extractBearerToken(req);
    if (!token) {
      next();
      return;
    }

    try {
      attachUser(req, verifyBearerToken(token));
    } catch {
      // Continue without a user when the token is invalid or expired.
    }
    next();
  };
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new ApiError(401, 'Authentication required'));
      return;
    }

    if (!roles.includes(req.user.role)) {
      next(new ApiError(403, 'You do not have permission to perform this action'));
      return;
    }

    next();
  };
}

function userHasPermissions(
  user: NonNullable<Request['user']>,
  permissions: string[],
): boolean {
  if (user.adminLevel === 'super') return true;

  const userPermissions = new Set(user.permissions);
  if (
    ALL_ADMIN_PERMISSIONS.every((permission) => userPermissions.has(permission))
  ) {
    return true;
  }

  return permissions.every((permission) => userPermissions.has(permission));
}

export function hasPermission(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(new ApiError(401, 'Authentication required'));
      return;
    }

    if (req.user.role !== 'admin') {
      next(new ApiError(403, 'Admin access required'));
      return;
    }

    if (!userHasPermissions(req.user, permissions)) {
      next(new ApiError(403, 'Missing required admin permission'));
      return;
    }

    next();
  };
}
