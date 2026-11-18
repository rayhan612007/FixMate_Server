import mongoose from 'mongoose';

const serviceSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['Smartphone', 'Laptop & PC', 'AC', 'Refrigerator', 'TV', 'Washing Machine', 'Electrical'],
    },
    description: { type: String, required: true },
    image: { type: String, required: true }, // ImgBB URL
    basePrice: { type: Number, required: true, min: 0 },
    estimatedDuration: { type: String, required: true }, // e.g. "2-3 hours"
    serviceMode: { type: String, enum: ['Home Visit', 'Shop Drop-off'], required: true },
    serviceArea: { type: String, required: true }, // e.g. "Dhanmondi, Dhaka"
    technicianName: { type: String, required: true }, // copied from the session user
    technicianEmail: { type: String, required: true, index: true }, // owner
    approvalStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },
    isAvailable: { type: Boolean, default: true },
  },
  { timestamps: true }, // createdAt / updatedAt
);

export const Service = mongoose.model('Service', serviceSchema);
