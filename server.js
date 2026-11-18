import 'dotenv/config';
import app from './src/app.js';
import { connectToMongoDB, ensureIndexes } from './src/db.js';

const PORT = process.env.PORT ?? 5000;

async function startServer() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing. Set it in backend/.env');
  }

  await connectToMongoDB();
  await ensureIndexes();

  app.listen(PORT, () => {
    console.log(`FixMate backend running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
