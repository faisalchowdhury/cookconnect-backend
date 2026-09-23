import jwt from 'jsonwebtoken';
import { env } from '@/config/env';
import { logger } from '@/config/logger';
import { ApiError } from '@/shared/ApiError';
import { sendMail } from '@/utils/email';
import {
  comparePassword,
  generateOtp,
  hashPassword,
  hashToken,
  randomId,
  signRefreshToken,
  verifyRefreshToken,
} from '@/utils/crypto';
import * as userService from '@/modules/user/user.service';
import { IUserDocument } from '@/modules/user/user.interface';
import { UserRole } from '@/modules/user/user.constant';
import { Session } from './session.model';
import { OtpToken, OtpPurpose } from './otp.model';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  ResendOtpInput,
  VerifyOtpInput,
} from './auth.validation';

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
export const REFRESH_COOKIE_NAME = 'refreshToken';
export const DASHBOARD_REFRESH_COOKIE_NAME = 'adminRefreshToken';

// The public site and the admin dashboard call the same API host and cookies ignore
// ports, so a shared cookie name means signing into one app ends the other's session.
export function refreshCookieNameFor(client: string | undefined): string {
  return client === 'dashboard' ? DASHBOARD_REFRESH_COOKIE_NAME : REFRESH_COOKIE_NAME;
}

type SessionMeta = {
  userAgent?: string;
  ip?: string;
};

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
};

function issueAccessToken(user: IUserDocument): string {
  return jwt.sign(
    {
      userId: String(user._id),
      role: user.role,
      permissions: user.permissions ?? [],
      adminLevel: user.adminLevel ?? null,
      email: user.email,
    },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_EXPIRES as jwt.SignOptions['expiresIn'] },
  );
}

function refreshExpiresAt(): Date {
  return new Date(Date.now() + env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000);
}

async function createSession(
  user: IUserDocument,
  meta: SessionMeta,
  familyId?: string,
): Promise<AuthTokens> {
  const family = familyId ?? randomId();
  const jti = randomId();
  const refreshToken = signRefreshToken({
    userId: String(user._id),
    familyId: family,
    jti,
  });
  const tokenHash = hashToken(refreshToken);

  await Session.create({
    userId: user._id,
    tokenHash,
    familyId: family,
    userAgent: meta.userAgent,
    ip: meta.ip,
    expiresAt: refreshExpiresAt(),
    revokedAt: null,
  });

  return {
    accessToken: issueAccessToken(user),
    refreshToken,
  };
}

async function revokeSessionFamily(familyId: string): Promise<void> {
  await Session.updateMany(
    { familyId, revokedAt: null },
    { revokedAt: new Date() },
  );
}

async function createRoleProfileStub(userId: string, role: UserRole): Promise<void> {
  try {
    if (role === 'candidate') {
      const { CandidateProfile } = await import('../candidate/candidate.model');
      await CandidateProfile.create({ userId });
      return;
    }

    if (role === 'employer') {
      const { EmployerProfile } = await import('../employer/employer.model');
      await EmployerProfile.create({ userId });
    }
  } catch (err) {
    // Registration must not fail if this errors, but a missing stub causes every
    // subsequent /candidates/me or /employers/me call to 404 — so it must be visible.
    logger.error('Failed to create role profile stub', { err, userId, role });
  }
}

async function invalidateActiveOtps(email: string, purpose: OtpPurpose): Promise<void> {
  await OtpToken.updateMany(
    { email, purpose, consumedAt: null },
    { consumedAt: new Date() },
  );
}

async function storeAndSendOtp(
  email: string,
  purpose: OtpPurpose,
  subject: string,
  message: (code: string) => { html: string; text: string },
): Promise<void> {
  const code = generateOtp();
  const codeHash = hashToken(code);

  await invalidateActiveOtps(email, purpose);
  await OtpToken.create({
    email,
    codeHash,
    purpose,
    attempts: 0,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
    consumedAt: null,
  });

  const body = message(code);
  await sendMail({
    to: email,
    subject,
    html: body.html,
    text: body.text,
  });
}

async function verifyOtpCode(
  email: string,
  code: string,
  purpose: OtpPurpose,
): Promise<void> {
  const otp = await OtpToken.findOne({
    email: email.toLowerCase().trim(),
    purpose,
    consumedAt: null,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!otp) {
    throw new ApiError(400, 'Invalid or expired verification code');
  }

  if (otp.attempts >= MAX_OTP_ATTEMPTS) {
    throw new ApiError(429, 'Too many verification attempts');
  }

  const codeHash = hashToken(code);
  if (otp.codeHash !== codeHash) {
    otp.attempts += 1;
    await otp.save();
    throw new ApiError(400, 'Invalid or expired verification code');
  }

  otp.consumedAt = new Date();
  await otp.save();
}

function assertAccountUsable(user: IUserDocument): void {
  if (user.status === 'suspended') {
    throw new ApiError(403, 'Account suspended');
  }
  if (user.status === 'deleted' || user.deletedAt) {
    throw new ApiError(403, 'Account unavailable');
  }
}

function isAccountLocked(user: IUserDocument): boolean {
  return Boolean(user.lockedUntil && user.lockedUntil.getTime() > Date.now());
}

export async function register(input: RegisterInput): Promise<{ message: string }> {
  const email = input.email.toLowerCase().trim();
  const existing = await userService.findByEmail(email);
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const passwordHash = await hashPassword(input.password);
  const user = await userService.createUser({
    email,
    passwordHash,
    role: input.role,
    phone: input.phone,
    locale: input.locale ?? 'fr',
    status: 'pending',
    emailVerified: false,
    authProvider: 'local',
  });

  await createRoleProfileStub(String(user._id), input.role);

  await storeAndSendOtp(
    email,
    'verify-email',
    'Verify your CookconneKt email',
    (code) => ({
      html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    }),
  );

  return { message: 'Registration successful. Please verify your email.' };
}

export async function verifyOtp(input: VerifyOtpInput): Promise<{ message: string }> {
  const email = input.email.toLowerCase().trim();
  const user = await userService.findByEmail(email);
  if (!user) {
    throw new ApiError(404, 'Account not found');
  }

  await verifyOtpCode(email, input.code, 'verify-email');
  await userService.setEmailVerified(String(user._id));

  return { message: 'Email verified successfully' };
}

export async function resendOtp(input: ResendOtpInput): Promise<{ message: string }> {
  const email = input.email.toLowerCase().trim();
  const user = await userService.findByEmail(email);
  if (!user) {
    return { message: 'If the account exists, a new code has been sent' };
  }

  if (user.emailVerified) {
    throw new ApiError(400, 'Email is already verified');
  }

  await storeAndSendOtp(
    email,
    'verify-email',
    'Verify your CookconneKt email',
    (code) => ({
      html: `<p>Your verification code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
      text: `Your verification code is ${code}. It expires in 10 minutes.`,
    }),
  );

  return { message: 'If the account exists, a new code has been sent' };
}

export async function login(
  input: LoginInput,
  meta: SessionMeta,
): Promise<{ accessToken: string; refreshToken: string; user: Record<string, unknown> }> {
  const email = input.email.toLowerCase().trim();
  const user = await userService.findByEmail(email, true);
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  assertAccountUsable(user);

  if (isAccountLocked(user)) {
    throw new ApiError(423, 'Account temporarily locked due to failed login attempts');
  }

  if (user.lockedUntil && user.lockedUntil.getTime() <= Date.now()) {
    await userService.resetFailedLogin(String(user._id));
    user.failedLoginAttempts = 0;
    user.lockedUntil = null;
  }

  const passwordOk = await comparePassword(input.password, user.passwordHash ?? '');
  if (!passwordOk) {
    await userService.incrementFailedLogin(String(user._id));
    throw new ApiError(401, 'Invalid email or password');
  }

  await userService.resetFailedLogin(String(user._id));
  await userService.updateUser(String(user._id), { lastLoginAt: new Date() });

  const tokens = await createSession(user, meta);

  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: user.toJSON() as Record<string, unknown>,
  };
}

export async function refresh(
  refreshToken: string,
  meta: SessionMeta,
): Promise<{ accessToken: string; refreshToken: string }> {
  let payload: { userId: string; familyId: string; jti: string };
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  const tokenHash = hashToken(refreshToken);
  const session = await Session.findOne({ tokenHash });

  if (!session) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  if (session.revokedAt) {
    await revokeSessionFamily(session.familyId);
    throw new ApiError(401, 'Refresh token reuse detected');
  }

  if (session.expiresAt.getTime() <= Date.now()) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  session.revokedAt = new Date();
  await session.save();

  const user = await userService.findById(payload.userId);
  if (!user) {
    throw new ApiError(401, 'Invalid or expired refresh token');
  }

  assertAccountUsable(user);

  return createSession(user, meta, session.familyId);
}

export async function logout(refreshToken: string | undefined): Promise<{ message: string }> {
  if (!refreshToken) {
    return { message: 'Logged out successfully' };
  }

  const tokenHash = hashToken(refreshToken);
  await Session.updateOne({ tokenHash, revokedAt: null }, { revokedAt: new Date() });

  return { message: 'Logged out successfully' };
}

export async function forgotPassword(
  input: ForgotPasswordInput,
): Promise<{ message: string }> {
  const email = input.email.toLowerCase().trim();
  const user = await userService.findByEmail(email);

  if (user && user.authProvider === 'local') {
    await storeAndSendOtp(
      email,
      'reset-password',
      'Reset your CookconneKt password',
      (code) => ({
        html: `<p>Your password reset code is <strong>${code}</strong>. It expires in 10 minutes.</p>`,
        text: `Your password reset code is ${code}. It expires in 10 minutes.`,
      }),
    );
  }

  return { message: 'If the account exists, a reset code has been sent' };
}

export async function resetPassword(input: ResetPasswordInput): Promise<{ message: string }> {
  const email = input.email.toLowerCase().trim();
  const user = await userService.findByEmail(email, true);
  if (!user) {
    // Same answer as a wrong code, so the endpoint cannot be used to probe for accounts.
    throw new ApiError(400, 'Invalid or expired verification code');
  }

  await verifyOtpCode(email, input.code, 'reset-password');

  const passwordHash = await hashPassword(input.password);
  await userService.updateUser(String(user._id), { passwordHash });
  await userService.resetFailedLogin(String(user._id));

  await Session.updateMany(
    { userId: user._id, revokedAt: null },
    { revokedAt: new Date() },
  );

  return { message: 'Password reset successfully' };
}

export async function changePassword(
  userId: string,
  input: ChangePasswordInput,
): Promise<{ message: string }> {
  const found = await userService.findById(userId);
  if (!found) {
    throw new ApiError(404, 'Account not found');
  }

  const user = await userService.findByEmail(found.email, true);
  if (!user) {
    throw new ApiError(404, 'Account not found');
  }

  const currentOk = await comparePassword(input.currentPassword, user.passwordHash ?? '');
  if (!currentOk) {
    // 400, not 401: the session is valid, and clients treat 401 as an expired login.
    throw new ApiError(400, 'Current password is incorrect');
  }

  const passwordHash = await hashPassword(input.newPassword);
  await userService.updateUser(String(user._id), { passwordHash });

  await Session.updateMany(
    { userId: user._id, revokedAt: null },
    { revokedAt: new Date() },
  );

  return { message: 'Password changed successfully' };
}

// Same owner view as /candidates/me and /employers/me, so clients get resolved media URLs.
async function loadProfile(user: IUserDocument): Promise<Record<string, unknown> | null> {
  const userId = String(user._id);
  try {
    if (user.role === 'candidate') {
      const { CandidateProfile } = await import('../candidate/candidate.model');
      if (!(await CandidateProfile.exists({ userId: user._id }))) return null;
      const candidateService = await import('../candidate/candidate.service');
      return await candidateService.getMe(userId);
    }

    if (user.role === 'employer') {
      const { EmployerProfile } = await import('../employer/employer.model');
      if (!(await EmployerProfile.exists({ userId: user._id }))) return null;
      const employerService = await import('../employer/employer.service');
      return await employerService.getMe(userId);
    }
  } catch (err) {
    logger.error('Failed to load profile for /auth/me', { err, userId, role: user.role });
  }

  return null;
}

export async function getMe(userId: string): Promise<{
  user: Record<string, unknown>;
  profile: Record<string, unknown> | null;
  completeness: number | null;
}> {
  const user = await userService.findById(userId);
  if (!user) {
    throw new ApiError(404, 'Account not found');
  }

  const profile = await loadProfile(user);
  const completeness =
    profile && typeof profile.completionPercent === 'number'
      ? profile.completionPercent
      : null;

  return {
    user: user.toJSON() as Record<string, unknown>,
    profile,
    completeness,
  };
}

export function getRefreshCookieOptions() {
  return {
    httpOnly: true,
    secure: env.COOKIE_SECURE,
    sameSite: 'lax' as const,
    maxAge: env.JWT_REFRESH_EXPIRES_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  };
}
