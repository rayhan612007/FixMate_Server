import { getDb } from '../db.js';

/**
 * `payments` collection. Native mongodb driver (no mongoose).
 * stripeSessionId carries a UNIQUE index (see db.js ensureIndexes) so a payment
 * can never be recorded twice — enforced by MongoDB, not just by app code.
 *
 * Document shape:
 * { _id: ObjectId, bookingId: String, serviceTitle, customerName, customerEmail,
 *   technicianName, technicianEmail, amount: Number, currency, transactionId,
 *   stripeSessionId: String (unique), paymentStatus, paidAt: Date }
 */
export function payments() {
  return getDb().collection('payments');
}
