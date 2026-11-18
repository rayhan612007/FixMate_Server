import { Router } from 'express';
import { User } from '../models/User.js';
import { Service } from '../models/Service.js';
import { HttpError, verifyAdmin, verifyToken } from '../middlewares/auth.middleware.js';

const router = Router();

function requireUser(req) {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user;
}

/** GET /api/admin/users — admin lists all users */
router.get('/users', verifyAdmin, async (_req, res, next) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json({ success: true, data: users });
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
    const target = await User.findById(req.params.id);
    if (!target) throw new HttpError(404, 'User not found');
    if (target.email === user.email) {
      throw new HttpError(400, 'You cannot change your own role');
    }
    target.role = role;
    await target.save();
    res.json({ success: true, message: `Role updated to ${role}`, data: target });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/stats — dashboard overview cards */
router.get('/stats', verifyAdmin, async (_req, res, next) => {
  try {
    const [totalUsers, totalTechnicians, pendingServices] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'technician' }),
      Service.countDocuments({ approvalStatus: 'pending' }),
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
    const target = await User.findOne({ email: user.email });
    if (!target) throw new HttpError(404, 'User not found');

    const { name, phone, area, bio, image } = req.body ?? {};
    if (typeof name === 'string' && name.trim()) target.name = name;
    if (typeof phone === 'string') target.phone = phone;
    if (typeof area === 'string') target.area = area;
    if (typeof bio === 'string') target.bio = bio;
    if (typeof image === 'string' && image) target.image = image;
    await target.save();
    res.json({ success: true, message: 'Profile updated', data: target });
  } catch (err) {
    next(err);
  }
});

export default router;
