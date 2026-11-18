import { Router } from 'express';
import { Service } from '../models/Service.js';
import { Booking } from '../models/Booking.js';
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
    const service = await Service.findById(idStr);
    if (!service || service.approvalStatus !== 'approved' || !service.isAvailable) {
      throw new HttpError(404, 'Service not found');
    }
    if (service.technicianEmail === user.email) {
      throw new HttpError(403, 'Forbidden: you cannot request your own service');
    }

    // A customer cannot have two active requests for the same service
    const duplicate = await Booking.findOne({
      customerEmail: user.email,
      serviceId: idStr,
      status: { $in: ACTIVE_STATUSES },
    });
    if (duplicate) {
      throw new HttpError(409, 'You already have an active request for this service');
    }

    const booking = await Booking.create({
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
      paymentStatus: 'unpaid',
    });
    res.status(201).json({ success: true, message: 'Repair request sent', data: booking });
  } catch (err) {
    next(err);
  }
});

/** GET /api/bookings/my — customer's own bookings */
router.get('/my', verifyCustomer, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const bookings = await Booking.find({ customerEmail: user.email }).sort({ createdAt: -1 });
    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
});

/** GET /api/bookings/technician — bookings for the logged-in technician */
router.get('/technician', verifyTechnician, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const bookings = await Booking.find({ technicianEmail: user.email }).sort({ createdAt: -1 });
    res.json({ success: true, data: bookings });
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

    const booking = await Booking.findById(id);
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.technicianEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: you do not own this job');
    }

    const current = booking.status;
    if (
      (current === 'requested' && (status === 'accepted' || status === 'rejected')) ||
      (current === 'accepted' && status === 'in-progress')
    ) {
      booking.status = status;
    } else if (current === 'in-progress' && status === 'completed') {
      if (typeof finalAmount !== 'number' || finalAmount <= 0) {
        throw new HttpError(400, 'finalAmount must be a number greater than 0');
      }
      booking.status = 'completed';
      booking.finalAmount = finalAmount;
    } else {
      throw new HttpError(400, `Invalid status change: ${current} → ${status}`);
    }

    await booking.save();
    res.json({ success: true, message: `Job status updated to ${booking.status}`, data: booking });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/bookings/:id/cancel — customer cancels own booking while still 'requested' */
router.patch('/:id/cancel', verifyCustomer, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const { id } = req.params;

    const booking = await Booking.findById(id);
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.customerEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: you do not own this booking');
    }
    if (booking.status !== 'requested') {
      throw new HttpError(400, 'Only a requested job can be cancelled');
    }
    booking.status = 'cancelled';
    await booking.save();
    res.json({ success: true, message: 'Booking cancelled', data: booking });
  } catch (err) {
    next(err);
  }
});

/** GET /api/bookings/admin/all — admin sees every booking (read-only) */
router.get('/admin/all', verifyAdmin, async (_req, res, next) => {
  try {
    const bookings = await Booking.find().sort({ createdAt: -1 });
    res.json({ success: true, data: bookings });
  } catch (err) {
    next(err);
  }
});

export default router;
