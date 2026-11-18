import { getDb } from '../db.js';

/**
 * `bookings` collection. Native mongodb driver (no mongoose).
 * Service and customer fields are copied at request time so the booking still
 * renders if the service or user changes later.
 *
 * Document shape:
 * { _id: ObjectId, serviceId: String, serviceTitle, serviceImage, category, basePrice,
 *   technicianName, technicianEmail, customerName, customerEmail, customerPhone, address,
 *   preferredDate: Date, problemDescription,
 *   status: 'requested'|'accepted'|'rejected'|'in-progress'|'completed'|'cancelled',
 *   finalAmount: Number, paymentStatus: 'unpaid'|'paid', createdAt: Date, updatedAt: Date }
 */
export function bookings() {
  return getDb().collection('bookings');
}
