import express, { Application } from 'express';
import cors from 'cors';
import { verifyToken } from './middlewares/auth.middleware';
import { errorHandler } from './middlewares/error.middleware';
import servicesRouter from './routes/services.routes';
import bookingsRouter from './routes/bookings.routes';
import paymentsRouter, { stripeWebhook } from './routes/payments.routes';
import adminRouter from './routes/admin.routes';
import uploadRouter from './routes/upload.routes';

const app: Application = express();

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
