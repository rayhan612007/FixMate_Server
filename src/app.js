import express from 'express';
import cors from 'cors';
import { verifyToken } from './middlewares/auth.middleware.js';
import { errorHandler } from './middlewares/error.middleware.js';
import servicesRouter from './routes/services.routes.js';
import bookingsRouter from './routes/bookings.routes.js';
import paymentsRouter, { stripeWebhook } from './routes/payments.routes.js';
import adminRouter from './routes/admin.routes.js';
import uploadRouter from './routes/upload.routes.js';

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
);

// Stripe webhook MUST read the raw body for signature verification — mount before express.json()
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), stripeWebhook);

app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'fixmate-backend' });
});

// Routes
app.use('/api/services', servicesRouter);
app.use('/api/bookings', bookingsRouter);
app.use('/api/payments', paymentsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/upload', uploadRouter);

// Example protected route: returns the decoded JWT user
app.get('/api/auth/me', verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.use(errorHandler);

export default app;
