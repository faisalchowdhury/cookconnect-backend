import { Router } from 'express';
import * as partnerController from './partner.controller';

const router = Router();

router.get('/', partnerController.listPublic);

export default router;
