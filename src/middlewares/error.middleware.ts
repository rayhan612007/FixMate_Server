import { Request, Response, NextFunction } from 'express';
import { HttpError } from '../middlewares/auth.middleware';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
}
