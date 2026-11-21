import express from 'express';
import cors from 'cors';
import { verifyToken } from './middlewares/auth.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';
import servicesRouter from './routes/services.routes.js';
import bookingsRouter from './routes/bookings.routes.js';
import paymentsRouter, { stripeWebhook } from './routes/payments.routes.js';
import adminRouter from './routes/admin.routes.js';
import uploadRouter from './routes/upload.routes.js';
import usersRouter from './routes/users.routes.js';

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  }),
);

// Stripe needs the untouched raw body to verify the webhook signature,
// so this route must be registered before express.json().
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

// Generous limit so base64 image uploads (avatar/service photos) are accepted.
app.use(express.json({ limit: '100mb' }));

app.get('/', (_req, res) => {
  res.send({ message: 'This Fixmate Home Route' });
});

app.use('/api/services', servicesRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/users', usersRouter);
app.use('/api/upload', uploadRouter);

// Returns the decoded JWT user (handy for checking auth while developing).
app.get('/api/auth/me', verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.use(errorHandler);

export default app;
