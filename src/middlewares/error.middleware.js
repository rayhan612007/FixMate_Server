import { HttpError } from './auth.middleware.js';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
}
