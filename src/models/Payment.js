import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    bookingId: { type: String, required: true, index: true },
    // Copied from the booking for history display
    serviceTitle: { type: String, required: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true, index: true },
    technicianName: { type: String, required: true },
    technicianEmail: { type: String, required: true, index: true },
    amount: { type: Number, required: true }, // = booking.finalAmount
    currency: { type: String, default: 'usd' },
    transactionId: { type: String, required: true }, // Stripe payment_intent id
    stripeSessionId: { type: String, required: true, unique: true }, // one payment per session, ever
    paymentStatus: { type: String, default: 'paid' },
    paidAt: { type: Date, default: Date.now },
  },
);

export const Payment = mongoose.model('Payment', paymentSchema);
