import { Router } from 'express';
import * as siteSettingsController from './siteSettings.controller';

const router = Router();

router.get('/', siteSettingsController.getPublic);

export default router;
