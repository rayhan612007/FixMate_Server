import express, { Application } from 'express';
import cors from 'cors';
import { verifyToken } from './middlewares/auth.middleware';
import { errorHandler } from './middlewares/error.middleware';
import servicesRouter from './routes/services.routes';
import bookingsRouter from './routes/bookings.routes';

const app: Application = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL ?? 'http://localhost:3000',
    credentials: true,
  }),
);
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'fixmate-backend' });
});

// Routes
app.use('/api/services', servicesRouter);
app.use('/api/bookings', bookingsRouter);

// Example protected route: returns the decoded JWT user
app.get('/api/auth/me', verifyToken, (req, res) => {
  res.json({ success: true, user: req.user });
});

app.use(errorHandler);

export default app;
