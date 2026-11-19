import { Router } from 'express';
import { users } from '../models/User.js';
import { HttpError, getCurrentUser, verifyToken } from '../middlewares/auth.middleware.js';

const router = Router();

export async function updateOwnProfile(req, res, next) {
  try {
    const user = getCurrentUser(req);
    const target = await users().findOne({ email: user.email });
    if (!target) throw new HttpError(404, 'User not found');

    const { name, phone, area, bio, image } = req.body ?? {};
    const updates = {};
    if (typeof name === 'string' && name.trim()) updates.name = name;
    if (typeof phone === 'string') updates.phone = phone;
    if (typeof area === 'string') updates.area = area;
    if (typeof bio === 'string') updates.bio = bio;
    if (typeof image === 'string' && image) updates.image = image;

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await users().updateOne({ _id: target._id }, { $set: updates });
    }

    res.json({ success: true, message: 'Profile updated', data: { ...target, ...updates } });
  } catch (err) {
    next(err);
  }
}

router.patch('/profile', verifyToken, updateOwnProfile);

export default router;
