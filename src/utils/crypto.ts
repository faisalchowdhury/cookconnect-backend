import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '@/config/env';

const BCRYPT_COST = 12;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export type AccessPayload = {
  userId: string;
  role: string;
  permissions: string[];
};

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'],
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessPayload;
}

export function signRefreshToken(payload: { userId: string; familyId: string; jti: string }): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, {
    expiresIn: `${env.JWT_REFRESH_EXPIRES_DAYS}d`,
  });
}

export function verifyRefreshToken(token: string): { userId: string; familyId: string; jti: string } {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as {
    userId: string;
    familyId: string;
    jti: string;
  };
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

export function randomId(): string {
  return crypto.randomUUID();
}

export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export function isPasswordValid(password: string): boolean {
  return PASSWORD_REGEX.test(password);
}
