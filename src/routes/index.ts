import { Router } from 'express';
import status from './testAPI';
import sendTokens from './sendTokens'

// Init router and path
const router = Router();


// Add sub-routes
router.use('/status', status)
router.use('/sendTokens', sendTokens)

// Export the base-router
export default router;
