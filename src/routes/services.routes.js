import { Router } from 'express';
import { services } from '../models/Service.js';
import { toObjectId } from '../db.js';
import { HttpError, verifyAdmin, verifyTechnician } from '../middlewares/auth.middleware.js';

const router = Router();

const CATEGORIES = ['Smartphone', 'Laptop & PC', 'AC', 'Refrigerator', 'TV', 'Washing Machine', 'Electrical'];
const SERVICE_MODES = ['Home Visit', 'Shop Drop-off'];

function requireUser(req) {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user;
}

/** Escape regex metacharacters so search input is matched literally (a query like "laptop (dell)" must not throw a 500). */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build the MongoDB filter + sort for the public Browse Services list (Challenge 1).
 * All searching, filtering and sorting is executed inside MongoDB — nothing is
 * filtered with JavaScript .filter() on the client.
 */
export function buildServicesListQuery(params = {}) {
  const { search, category, serviceMode, sort } = params;

  // Public page only shows approved + available services
  const filter = { approvalStatus: 'approved', isAvailable: true };

  // Keyword search across title OR category (case-insensitive, literal substring match)
  if (typeof search === 'string' && search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = [{ title: rx }, { category: rx }];
  }

  // Category filter — whitelisted enum, case-tolerant so /services?category=ac also works
  if (typeof category === 'string' && category.trim()) {
    const match = CATEGORIES.find((c) => c.toLowerCase() === category.trim().toLowerCase());
    if (match) filter.category = match;
  }

  // Service mode filter (Home Visit / Shop Drop-off)
  if (typeof serviceMode === 'string' && serviceMode.trim()) {
    const match = SERVICE_MODES.find((m) => m.toLowerCase() === serviceMode.trim().toLowerCase());
    if (match) filter.serviceMode = match;
  }

  // Sort: Newest (default) | Price: Low to High | Price: High to Low — stable _id tie-breaker
  let sortQuery = { createdAt: -1, _id: -1 };
  if (sort === 'price-asc') sortQuery = { basePrice: 1, _id: -1 };
  else if (sort === 'price-desc') sortQuery = { basePrice: -1, _id: -1 };

  return { filter, sort: sortQuery };
}

/** GET /api/services — public list with server-side search, filter, sort */
router.get('/', async (req, res, next) => {
  try {
    const { filter, sort } = buildServicesListQuery(req.query);
    const data = await services().find(filter).sort(sort).toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** GET /api/services/:id — public details (only approved + available) */
router.get('/:id', async (req, res, next) => {
  try {
    const oid = toObjectId(req.params.id);
    if (!oid) throw new HttpError(404, 'Service not found');

    const service = await services().findOne({
      _id: oid,
      approvalStatus: 'approved',
      isAvailable: true,
    });
    if (!service) throw new HttpError(404, 'Service not found');
    res.json({ success: true, data: service });
  } catch (err) {
    next(err);
  }
});

/** POST /api/services — technician adds a service (starts pending) */
router.post('/', verifyTechnician, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const {
      title,
      category,
      description,
      image,
      basePrice,
      estimatedDuration,
      serviceMode,
      serviceArea,
    } = req.body ?? {};

    for (const [field, value] of Object.entries({ title, category, description, image, estimatedDuration, serviceMode, serviceArea })) {
      if (typeof value !== 'string' || !value.trim()) {
        throw new HttpError(400, `Invalid field: ${field}`);
      }
    }
    if (typeof basePrice !== 'number' || basePrice <= 0) {
      throw new HttpError(400, 'basePrice must be a positive number');
    }
    if (!CATEGORIES.includes(category)) throw new HttpError(400, 'Invalid category');
    if (!SERVICE_MODES.includes(serviceMode)) throw new HttpError(400, 'Invalid service mode');

    const now = new Date();
    const doc = {
      title,
      category,
      description,
      image,
      basePrice,
      estimatedDuration,
      serviceMode,
      serviceArea,
      technicianName: user.name ?? user.email,
      technicianEmail: user.email,
      approvalStatus: 'pending',
      isAvailable: true,
      createdAt: now,
      updatedAt: now,
    };
    const result = await services().insertOne(doc);
    doc._id = result.insertedId;
    res.status(201).json({ success: true, message: 'Service added, waiting for admin approval', data: doc });
  } catch (err) {
    next(err);
  }
});

/** GET /api/services/my/all — technician's own services (any approval status) */
router.get('/my/all', verifyTechnician, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const data = await services().find({ technicianEmail: user.email }).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/services/:id — technician edits own service; approval resets to pending */
router.patch('/:id', verifyTechnician, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const oid = toObjectId(req.params.id);
    if (!oid) throw new HttpError(404, 'Service not found');
    const service = await services().findOne({ _id: oid });
    if (!service) throw new HttpError(404, 'Service not found');
    if (service.technicianEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: you do not own this service');
    }

    const allowed = ['title', 'category', 'description', 'image', 'basePrice', 'estimatedDuration', 'serviceMode', 'serviceArea', 'isAvailable'];
    const updates = {};
    for (const field of allowed) {
      if (req.body?.[field] !== undefined) updates[field] = req.body[field];
    }

    // No schema validation anymore — enforce the rules server-side here
    for (const field of ['title', 'description', 'image', 'estimatedDuration', 'serviceArea']) {
      if (updates[field] !== undefined && (typeof updates[field] !== 'string' || !updates[field].trim())) {
        throw new HttpError(400, `Invalid field: ${field}`);
      }
    }
    if (updates.category !== undefined && !CATEGORIES.includes(updates.category)) throw new HttpError(400, 'Invalid category');
    if (updates.serviceMode !== undefined && !SERVICE_MODES.includes(updates.serviceMode)) throw new HttpError(400, 'Invalid service mode');
    if (updates.basePrice !== undefined && (typeof updates.basePrice !== 'number' || updates.basePrice <= 0)) {
      throw new HttpError(400, 'basePrice must be a positive number');
    }
    if (updates.isAvailable !== undefined && typeof updates.isAvailable !== 'boolean') {
      throw new HttpError(400, 'isAvailable must be a boolean');
    }

    if (req.body?.isAvailable === undefined) {
      // any content edit sends the service back to admin approval
      updates.approvalStatus = 'pending';
    }
    updates.updatedAt = new Date();

    await services().updateOne({ _id: oid }, { $set: updates });
    const updated = await services().findOne({ _id: oid });
    res.json({ success: true, message: 'Service updated (re-approval required)', data: updated });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/services/:id — technician deletes own service */
router.delete('/:id', verifyTechnician, async (req, res, next) => {
  try {
    const user = requireUser(req);
    const oid = toObjectId(req.params.id);
    if (!oid) throw new HttpError(404, 'Service not found');
    const service = await services().findOne({ _id: oid });
    if (!service) throw new HttpError(404, 'Service not found');
    if (service.technicianEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: you do not own this service');
    }
    await services().deleteOne({ _id: oid });
    res.json({ success: true, message: 'Service deleted' });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/services/:id/approval — admin approves/rejects */
router.patch('/:id/approval', verifyAdmin, async (req, res, next) => {
  try {
    const { approvalStatus } = req.body ?? {};
    if (approvalStatus !== 'approved' && approvalStatus !== 'rejected') {
      throw new HttpError(400, "approvalStatus must be 'approved' or 'rejected'");
    }
    const oid = toObjectId(req.params.id);
    if (!oid) throw new HttpError(404, 'Service not found');
    const service = await services().findOneAndUpdate(
      { _id: oid },
      { $set: { approvalStatus, updatedAt: new Date() } },
      { returnDocument: 'after' },
    );
    if (!service) throw new HttpError(404, 'Service not found');
    res.json({ success: true, message: `Service ${approvalStatus}`, data: service });
  } catch (err) {
    next(err);
  }
});

/** GET /api/services/admin/all — admin sees all services (any status) */
router.get('/admin/all', verifyAdmin, async (_req, res, next) => {
  try {
    const data = await services().find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
