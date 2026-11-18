import 'dotenv/config';
import { connectToMongoDB, disconnectFromMongoDB, ensureIndexes } from './src/db.js';
import app from './src/app.js';

const PORT = process.env.PORT ?? 5000;

async function main() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing. Set it in backend/.env');
  }

  await connectToMongoDB();
  await ensureIndexes();

  app.listen(PORT, () => {
    console.log(`🚀 FixMate backend running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});

// Close the MongoClient only when the application terminates
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    disconnectFromMongoDB()
      .catch(() => {})
      .finally(() => process.exit(0));
  });
}
