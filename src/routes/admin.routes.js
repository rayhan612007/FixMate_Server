import { Router } from 'express';
import { users } from '../models/User.js';
import { services } from '../models/Service.js';
import { toObjectId } from '../db.js';
import { HttpError, getCurrentUser, verifyAdmin, verifyToken } from '../middlewares/auth.middleware.js';
import { listAdminBookings } from './bookings.routes.js';
import { listAdminPayments } from './payments.routes.js';
import { updateServiceApproval } from './services.routes.js';
import { updateOwnProfile } from './users.routes.js';

const router = Router();

const ROLES = ['customer', 'technician', 'admin'];

/** GET /api/admin/users — admin lists all users. */
router.get('/users', verifyToken, verifyAdmin, async (_req, res, next) => {
  try {
    const data = await users().find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/admin/users/:id/role — admin changes a role; not their own. */
router.patch('/users/:id/role', verifyToken, verifyAdmin, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const { role } = req.body ?? {};

    if (!ROLES.includes(role)) {
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

    res.json({
      success: true,
      message: `Role updated to ${role}`,
      data: { ...target, role, updatedAt },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/admin/stats — dashboard overview cards. */
router.get('/stats', verifyToken, verifyAdmin, async (_req, res, next) => {
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

/** Admin-only data routes use the same handlers as their existing aliases. */
router.get('/bookings', verifyToken, verifyAdmin, listAdminBookings);
router.patch('/services/:id/approval', verifyToken, verifyAdmin, updateServiceApproval);
router.get('/payments', verifyToken, verifyAdmin, listAdminPayments);

/** Legacy path retained for clients that still call /api/admin/profile. */
router.patch('/profile', verifyToken, updateOwnProfile);

export default router;
