import { Router } from 'express';
import { dashboardRouter, statisticsRouter } from '@/modules/analytics/analytics.admin.route';
import bannerAdminRoutes from '@/modules/banner/banner.admin.route';
import feedbackAdminRoutes from '@/modules/feedback/feedback.admin.route';
import jobAdminRoutes from '@/modules/job/job.admin.route';
import partnerAdminRoutes from '@/modules/partner/partner.admin.route';
import siteSettingsAdminRoutes from '@/modules/siteSettings/siteSettings.admin.route';
import taxonomyAdminRoutes from '@/modules/taxonomy/taxonomy.admin.route';
import adminActivityRoutes from './admin.activity.route';
import adminAdminsRoutes from './admin.admins.route';
import adminCandidatesRoutes from './admin.candidates.route';
import adminEmployersRoutes from './admin.employers.route';
import adminMediaRoutes from './admin.media.route';
import adminModerationRoutes from './admin.moderation.route';
import adminNotificationsRoutes from './admin.notifications.route';

const router = Router();

router.use('/dashboard', dashboardRouter);
router.use('/statistics', statisticsRouter);
router.use('/candidates', adminCandidatesRoutes);
router.use('/employers', adminEmployersRoutes);
router.use('/jobs', jobAdminRoutes);
router.use('/moderation', adminModerationRoutes);
router.use('/activity', adminActivityRoutes);
router.use('/feedback', feedbackAdminRoutes);
router.use('/banners', bannerAdminRoutes);
router.use('/partners', partnerAdminRoutes);
router.use('/taxonomies', taxonomyAdminRoutes);
router.use('/site-settings', siteSettingsAdminRoutes);
router.use('/media', adminMediaRoutes);
router.use('/notifications', adminNotificationsRoutes);
router.use('/admins', adminAdminsRoutes);

export default router;
