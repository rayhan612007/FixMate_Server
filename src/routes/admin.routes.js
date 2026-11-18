import { Router } from 'express';
import { users } from '../models/User.js';
import { services } from '../models/Service.js';
import { toObjectId } from '../db.js';
import { HttpError, verifyAdmin, verifyToken } from '../middlewares/auth.middleware.js';

const router = Router();

function requireUser(req) {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user;
}

/** GET /api/admin/users — admin lists all users */
router.get('/users', verifyAdmin, async (_req, res, next) => {
  try {
    const data = await users().find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/admin/users/:id/role — admin changes a role; admin cannot change their own role */
router.patch('/users/:id/role', verifyAdmin, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const { role } = req.body ?? {};
    if (role !== 'customer' && role !== 'technician' && role !== 'admin') {
      throw new HttpError(400, 'role must be customer, technician or admin');
    }
    const oid = toObjectId(req.params.id);
    if (!oid) throw new HttpError(404, 'User not found');
    const target = await users().findOne({ _id: oid });
    if (!target) throw new HttpError(404, 'User not found');
    if (target.email === user.email) {
      throw new HttpError(400, 'You cannot change your own role');
    }

    const updatedAt = new Date();
    await users().updateOne({ _id: oid }, { $set: { role, updatedAt } });
    res.json({ success: true, message: `Role updated to ${role}`, data: { ...target, role, updatedAt } });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/stats — dashboard overview cards */
router.get('/stats', verifyAdmin, async (_req, res, next) => {
  try {
    const [totalUsers, totalTechnicians, pendingServices] = await Promise.all([
      users().countDocuments(),
      users().countDocuments({ role: 'technician' }),
      services().countDocuments({ approvalStatus: 'pending' }),
    ]);
    res.json({ success: true, data: { totalUsers, totalTechnicians, pendingServices } });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/users/profile — any logged-in user updates their profile */
router.patch('/profile', verifyToken, async (req, res, next) => {
  try {
    const user = requireUser(req);
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
});

export default router;
