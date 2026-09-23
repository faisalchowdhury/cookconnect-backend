import { Router } from 'express';
import authRoutes from '@/modules/auth/auth.route';
import candidateRoutes from '@/modules/candidate/candidate.route';
import employerRoutes from '@/modules/employer/employer.route';
import jobRoutes from '@/modules/job/job.route';
import applicationRoutes from '@/modules/application/application.route';
import bookmarkRoutes from '@/modules/bookmark/bookmark.route';
import taxonomyRoutes from '@/modules/taxonomy/taxonomy.route';
import notificationRoutes from '@/modules/notification/notification.route';
import feedbackRoutes from '@/modules/feedback/feedback.route';
import bannerRoutes from '@/modules/banner/banner.route';
import partnerRoutes from '@/modules/partner/partner.route';
import siteSettingsRoutes from '@/modules/siteSettings/siteSettings.route';
import adminRoutes from '@/modules/admin/admin.route';
import healthRoutes from '@/modules/health/health.route';

const router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);
router.use('/candidates', candidateRoutes);
router.use('/employers', employerRoutes);
router.use('/jobs', jobRoutes);
router.use('/applications', applicationRoutes);
router.use('/bookmarks', bookmarkRoutes);
router.use('/taxonomies', taxonomyRoutes);
router.use('/notifications', notificationRoutes);
router.use('/feedback', feedbackRoutes);
router.use('/banners', bannerRoutes);
router.use('/partners', partnerRoutes);
router.use('/site-settings', siteSettingsRoutes);
router.use('/admin', adminRoutes);

export default router;
