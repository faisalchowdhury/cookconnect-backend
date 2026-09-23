import { Request, Response } from 'express';
import { ApiError } from '@/shared/ApiError';
import { catchAsync } from '@/shared/catchAsync';
import { sendResponse } from '@/shared/sendResponse';
import * as authService from './auth.service';

function sessionMeta(req: Request) {
  return {
    userAgent: req.headers['user-agent'],
    ip: req.ip,
  };
}

export const register = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.register(req.body);
  sendResponse({ res, statusCode: 201, message: result.message, data: null });
});

export const verifyOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.verifyOtp(req.body);
  sendResponse({ res, message: result.message, data: null });
});

export const resendOtp = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.resendOtp(req.body);
  sendResponse({ res, message: result.message, data: null });
});

function refreshCookieName(req: Request): string {
  return authService.refreshCookieNameFor(req.get('x-auth-client'));
}

export const login = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.login(req.body, sessionMeta(req));

  res.cookie(refreshCookieName(req), result.refreshToken, authService.getRefreshCookieOptions());

  sendResponse({
    res,
    message: 'Login successful',
    data: {
      accessToken: result.accessToken,
      user: result.user,
    },
  });
});

export const refresh = catchAsync(async (req: Request, res: Response) => {
  const cookieName = refreshCookieName(req);
  const refreshToken = req.cookies?.[cookieName] as string | undefined;
  if (!refreshToken) {
    throw new ApiError(401, 'Refresh token required');
  }

  const result = await authService.refresh(refreshToken, sessionMeta(req));

  res.cookie(cookieName, result.refreshToken, authService.getRefreshCookieOptions());

  sendResponse({
    res,
    message: 'Token refreshed',
    data: { accessToken: result.accessToken },
  });
});

export const logout = catchAsync(async (req: Request, res: Response) => {
  const cookieName = refreshCookieName(req);
  const refreshToken = req.cookies?.[cookieName] as string | undefined;
  const result = await authService.logout(refreshToken);

  res.clearCookie(cookieName, authService.getRefreshCookieOptions());

  sendResponse({ res, message: result.message, data: null });
});

export const forgotPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.forgotPassword(req.body);
  sendResponse({ res, message: result.message, data: null });
});

export const resetPassword = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.resetPassword(req.body);
  sendResponse({ res, message: result.message, data: null });
});

export const changePassword = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.changePassword(req.user!.id, req.body);
  sendResponse({ res, message: result.message, data: null });
});

export const getMe = catchAsync(async (req: Request, res: Response) => {
  const result = await authService.getMe(req.user!.id);
  sendResponse({ res, message: 'Profile retrieved', data: result });
});
