import { MongoClient, ObjectId } from 'mongodb';

// Your Atlas URI (mongodb+srv://...) goes in backend/.env as MONGODB_URI — never in git
const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017/fixmate';
const DB_NAME = process.env.MONGODB_DB ?? dbNameFromUri(MONGODB_URI);

/** Use the db name from the URI path (…mongodb.net/ has none → default "fixmate") */
function dbNameFromUri(uri) {
  try {
    return new URL(uri).pathname.replace(/^\//, '') || 'fixmate';
  } catch {
    return 'fixmate';
  }
}

const client = new MongoClient(MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('You successfully connected to MongoDB!');
    return client;
  } catch (err) {
    console.dir(err);
    throw err; // fail fast — never start the server without a database
  }
}

/** The database handle every model/collection uses */
export function getDb() {
  return client.db(DB_NAME);
}

/** string → ObjectId, or null for anything that is not a 24-char hex id */
export function toObjectId(id) {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) return null;
  return new ObjectId(id);
}

/** Indexes the app depends on (idempotent — safe to run on every boot) */
export async function ensureIndexes() {
  const db = getDb();
  const indexJobs = [
    // one payment per Stripe session, ever (webhook + success page can race)
    ['payments', { stripeSessionId: 1 }, { unique: true }],
    ['payments', { customerEmail: 1, paidAt: -1 }],
    ['bookings', { customerEmail: 1, createdAt: -1 }],
    ['bookings', { technicianEmail: 1, createdAt: -1 }],
    ['bookings', { status: 1 }],
    ['services', { technicianEmail: 1, createdAt: -1 }],
    ['services', { approvalStatus: 1, isAvailable: 1 }],
  ];
  for (const [name, keys, options] of indexJobs) {
    try {
      await db.collection(name).createIndex(keys, options);
    } catch (err) {
      console.warn(`⚠️ Could not create index on ${name}:`, err.message);
    }
  }
}

