import { MongoClient, ObjectId } from 'mongodb';

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB;

const globalForMongo = globalThis;
const client = globalForMongo.mongoClient ?? new MongoClient(MONGODB_URI, {
  maxPoolSize: 10,
  maxIdleTimeMS: 60000,
});
globalForMongo.mongoClient = client;

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log('You successfully connected to MongoDB!');
    return client;
  } catch (err) {
    console.dir(err);
    throw err;
  }
}

/** The database handle every model/collection uses. */
export function getDb() {
  return client.db(DB_NAME);
}

/** Converts a 24-character hex string to an ObjectId; anything else becomes null. */
export function toObjectId(id) {
  if (typeof id !== 'string' || !/^[0-9a-fA-F]{24}$/.test(id)) return null;
  return new ObjectId(id);
}

/** Indexes the app depends on. Creating the same index twice is safe. */
const INDEXES = [
  // One payment per Stripe session, ever (webhook + success page can race).
  { collection: 'payments', keys: { stripeSessionId: 1 }, options: { unique: true } },
  { collection: 'payments', keys: { customerEmail: 1, paidAt: -1 } },
  { collection: 'bookings', keys: { customerEmail: 1, createdAt: -1 } },
  { collection: 'bookings', keys: { technicianEmail: 1, createdAt: -1 } },
  { collection: 'bookings', keys: { status: 1 } },
  { collection: 'services', keys: { technicianEmail: 1, createdAt: -1 } },
  { collection: 'services', keys: { approvalStatus: 1, isAvailable: 1 } },
];

export async function ensureIndexes() {
  const db = getDb();

  for (const { collection, keys, options } of INDEXES) {
    try {
      await db.collection(collection).createIndex(keys, options);
    } catch (err) {
      console.warn(`Could not create index on ${collection}:`, err.message);
    }
  }
}
