import { Router } from 'express';
import { auth } from '@/middlewares/auth';
import { authRateLimit } from '@/middlewares/rateLimit';
import { validateRequest } from '@/middlewares/validateRequest';
import * as authController from './auth.controller';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendOtpSchema,
  resetPasswordSchema,
  verifyOtpSchema,
} from './auth.validation';

const router = Router();

router.post(
  '/register',
  authRateLimit,
  validateRequest({ body: registerSchema }),
  authController.register,
);

router.post(
  '/verify-otp',
  authRateLimit,
  validateRequest({ body: verifyOtpSchema }),
  authController.verifyOtp,
);

router.post(
  '/resend-otp',
  authRateLimit,
  validateRequest({ body: resendOtpSchema }),
  authController.resendOtp,
);

router.post(
  '/login',
  authRateLimit,
  validateRequest({ body: loginSchema }),
  authController.login,
);

router.post('/refresh', authController.refresh);

// Keyed by the refresh cookie, so it has to work after the access token has expired.
router.post('/logout', authController.logout);

router.post(
  '/forgot-password',
  authRateLimit,
  validateRequest({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);

router.post(
  '/reset-password',
  authRateLimit,
  validateRequest({ body: resetPasswordSchema }),
  authController.resetPassword,
);

router.post(
  '/change-password',
  auth(),
  validateRequest({ body: changePasswordSchema }),
  authController.changePassword,
);

router.get('/me', auth(), authController.getMe);

export default router;
