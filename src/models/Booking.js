import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema(
  {
    serviceId: { type: String, required: true, index: true }, // services._id
    // Copied from the service at request time (survives service edits/deletes)
    serviceTitle: { type: String, required: true },
    serviceImage: { type: String, required: true },
    category: { type: String, required: true },
    basePrice: { type: Number, required: true },
    technicianName: { type: String, required: true },
    technicianEmail: { type: String, required: true, index: true },
    // From the logged-in customer
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true, index: true },
    // From the request form
    customerPhone: { type: String, required: true },
    address: { type: String, required: true },
    preferredDate: { type: Date, required: true },
    problemDescription: { type: String, required: true, minlength: 20 },
    status: {
      type: String,
      enum: ['requested', 'accepted', 'rejected', 'in-progress', 'completed', 'cancelled'],
      default: 'requested',
      index: true,
    },
    finalAmount: { type: Number, default: 0 }, // set by technician when completing
    paymentStatus: { type: String, enum: ['unpaid', 'paid'], default: 'unpaid' },
  },
  { timestamps: true },
);

export const Booking = mongoose.model('Booking', bookingSchema);
