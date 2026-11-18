import { getDb } from '../db.js';

/**
 * `user` collection — BetterAuth (Next.js) owns this collection; we only read/update it.
 * role/phone/area/bio are BetterAuth additionalFields. Native mongodb driver (no mongoose).
 *
 * Document shape:
 * { _id: ObjectId, name, email, image, role: 'customer'|'technician'|'admin',
 *   phone, area, bio, createdAt: Date, updatedAt: Date }
 */
export function users() {
  return getDb().collection('user');
}
