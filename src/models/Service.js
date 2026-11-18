import { getDb } from '../db.js';

/**
 * `services` collection. Native mongodb driver (no mongoose).
 *
 * Document shape:
 * { _id: ObjectId, title, category, description, image, basePrice: Number,
 *   estimatedDuration, serviceMode: 'Home Visit'|'Shop Drop-off', serviceArea,
 *   technicianName, technicianEmail, approvalStatus: 'pending'|'approved'|'rejected',
 *   isAvailable: Boolean, createdAt: Date, updatedAt: Date }
 */
export function services() {
  return getDb().collection('services');
}
