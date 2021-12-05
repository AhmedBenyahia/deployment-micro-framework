import express from 'express';
import catchAsync from '../middlewares/catchAsync.middleware';
import containerController from '../controllers/container.controller';

const { buildAndRunContainer, initProject } = containerController;
const router = express.Router();

router.get('/re-deploy', catchAsync(buildAndRunContainer));
router.get('/initProject', catchAsync(initProject));

export default router;
