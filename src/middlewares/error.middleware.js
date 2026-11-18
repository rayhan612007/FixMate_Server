import { HttpError } from './auth.middleware.js';

/** Single place that turns thrown errors into JSON responses. */
export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message });
    return;
  }

  console.error(err);
  res.status(500).json({ success: false, message: 'Internal server error' });
}
