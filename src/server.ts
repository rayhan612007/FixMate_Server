import 'dotenv/config';
import mongoose from 'mongoose';
import app from './app';

const PORT = process.env.PORT ?? 5000;
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/fixmate';

async function main() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is missing. Set it in backend/.env');
  }

  await mongoose.connect(MONGODB_URI);
  console.log('✅ MongoDB connected');

  app.listen(PORT, () => {
    console.log(`🚀 FixMate backend running on http://localhost:${PORT}`);
  });
}

main().catch((err) => {
  console.error('❌ Failed to start server:', err);
  process.exit(1);
});
