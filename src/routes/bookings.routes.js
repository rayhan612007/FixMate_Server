import { Router } from 'express';
import { services } from '../models/Service.js';
import { bookings } from '../models/Booking.js';
import { toObjectId } from '../db.js';
import { HttpError, verifyAdmin, verifyCustomer, verifyTechnician } from '../middlewares/auth.middleware.js';

const router = Router();

const ACTIVE_STATUSES = ['requested', 'accepted', 'in-progress'];

function requireUser(req) {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user;
}

/**
 * POST /api/bookings — customer sends a repair request.
 * Server-enforced: only customers, no duplicate active request per service, valid date, ≥20 chars problem.
 */
router.post('/', verifyCustomer, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const { serviceId, customerPhone, address, preferredDate, problemDescription } = req.body ?? {};

    if (typeof customerPhone !== 'string' || !customerPhone.trim()) {
      throw new HttpError(400, 'Invalid field: customerPhone');
    }
    if (typeof address !== 'string' || !address.trim()) {
      throw new HttpError(400, 'Invalid field: address');
    }
    if (typeof problemDescription !== 'string' || problemDescription.trim().length < 20) {
      throw new HttpError(400, 'Problem description must be at least 20 characters');
    }
    const date = new Date(preferredDate);
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
      throw new HttpError(400, 'Invalid field: preferredDate');
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (date < today) {
      throw new HttpError(400, 'Preferred date must be today or a future date');
    }

    // Load the service server-side — never trust service data from the client
    const idStr = typeof serviceId === 'string' ? serviceId : String(serviceId);
    const serviceOid = toObjectId(idStr);
    if (!serviceOid) throw new HttpError(404, 'Service not found');
    const service = await services().findOne({ _id: serviceOid });
    if (!service || service.approvalStatus !== 'approved' || !service.isAvailable) {
      throw new HttpError(404, 'Service not found');
    }
    if (service.technicianEmail === user.email) {
      throw new HttpError(403, 'Forbidden: you cannot request your own service');
    }

    // A customer cannot have two active requests for the same service
    const duplicate = await bookings().findOne({
      customerEmail: user.email,
      serviceId: idStr,
      status: { $in: ACTIVE_STATUSES },
    });
    if (duplicate) {
      throw new HttpError(409, 'You already have an active request for this service');
    }

    const now = new Date();
    const doc = {
      serviceId: idStr,
      serviceTitle: service.title,
      serviceImage: service.image,
      category: service.category,
      basePrice: service.basePrice,
      technicianName: service.technicianName,
      technicianEmail: service.technicianEmail,
      customerName: user.name ?? user.email,
      customerEmail: user.email,
      customerPhone,
      address,
      preferredDate: date,
      problemDescription,
      status: 'requested',
      finalAmount: 0,
      paymentStatus: 'unpaid',
      createdAt: now,
      updatedAt: now,
    };
    const result = await bookings().insertOne(doc);
    doc._id = result.insertedId;
    res.status(201).json({ success: true, message: 'Repair request sent', data: doc });
  } catch (err) {
    next(err);
  }
});

/** GET /api/bookings/my — customer's own bookings */
router.get('/my', verifyCustomer, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const data = await bookings().find({ customerEmail: user.email }).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** GET /api/bookings/technician — bookings for the logged-in technician */
router.get('/technician', verifyTechnician, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const data = await bookings().find({ technicianEmail: user.email }).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/bookings/:id/status — technician (owner) moves the job forward.
 * Pipeline: requested → accepted | rejected; accepted → in-progress; in-progress → completed (+finalAmount > 0).
 */
router.patch('/:id/status', verifyTechnician, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const { id } = req.params;
    const { status, finalAmount } = req.body ?? {};

    const oid = toObjectId(id);
    if (!oid) throw new HttpError(404, 'Booking not found');
    const booking = await bookings().findOne({ _id: oid });
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.technicianEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: you do not own this job');
    }

    const current = booking.status;
    const updates = {};
    if (
      (current === 'requested' && (status === 'accepted' || status === 'rejected')) ||
      (current === 'accepted' && status === 'in-progress')
    ) {
      updates.status = status;
    } else if (current === 'in-progress' && status === 'completed') {
      if (typeof finalAmount !== 'number' || finalAmount <= 0) {
        throw new HttpError(400, 'finalAmount must be a number greater than 0');
      }
      updates.status = 'completed';
      updates.finalAmount = finalAmount;
    } else {
      throw new HttpError(400, `Invalid status change: ${current} → ${status}`);
    }
    updates.updatedAt = new Date();

    await bookings().updateOne({ _id: oid }, { $set: updates });
    res.json({ success: true, message: `Job status updated to ${updates.status}`, data: { ...booking, ...updates } });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/bookings/:id/cancel — customer cancels own booking while still 'requested' */
router.patch('/:id/cancel', verifyCustomer, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const { id } = req.params;

    const oid = toObjectId(id);
    if (!oid) throw new HttpError(404, 'Booking not found');
    const booking = await bookings().findOne({ _id: oid });
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.customerEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: you do not own this booking');
    }
    if (booking.status !== 'requested') {
      throw new HttpError(400, 'Only a requested job can be cancelled');
    }
    const updatedAt = new Date();
    await bookings().updateOne({ _id: oid }, { $set: { status: 'cancelled', updatedAt } });
    res.json({ success: true, message: 'Booking cancelled', data: { ...booking, status: 'cancelled', updatedAt } });
  } catch (err) {
    next(err);
  }
});

/** GET /api/bookings/admin/all — admin sees every booking (read-only) */
router.get('/admin/all', verifyAdmin, async (_req, res, next) => {
  try {
    const data = await bookings().find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
