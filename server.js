import 'dotenv/config';
import { connectToMongoDB, ensureIndexes } from './src/db.js';
import app from './src/app.js';

const PORT = process.env.PORT ?? 5000;

async function main() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing. Set it in backend/.env');
  }

  await connectToMongoDB();
  await ensureIndexes();

  app.listen(PORT, () => {
    console.log(`FixMate backend running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
