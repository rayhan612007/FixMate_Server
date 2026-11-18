import mongoose from 'mongoose';

/**
 * BetterAuth stores users in its own "user" collection (singular).
 * We treat that collection as our users collection — this model reads/updates it.
 * role/phone/area/bio are BetterAuth additionalFields.
 */
const userSchema = new mongoose.Schema(
  {
    name: { type: String },
    email: { type: String, required: true, unique: true },
    image: { type: String },
    role: { type: String, enum: ['customer', 'technician', 'admin'], default: 'customer' },
    phone: { type: String },
    area: { type: String },
    bio: { type: String },
  },
  { collection: 'user', strict: false, timestamps: true },
);

export const User = mongoose.model('User', userSchema);
