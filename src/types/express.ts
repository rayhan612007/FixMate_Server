import { Request } from 'express';

/**
 * Request with the decoded JWT user attached by the auth middlewares.
 * (req.user is available via the global Express.Request augmentation.)
 */
export type AuthRequest = Request;
