import express, { Application } from 'express';
import cors from 'cors';

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

export default app;
