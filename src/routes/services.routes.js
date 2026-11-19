import { Router } from 'express';
import { services } from '../models/Service.js';
import { users } from '../models/User.js';
import { toObjectId } from '../db.js';
import {
  HttpError,
  getCurrentUser,
  verifyAdmin,
  verifyTechnician,
  verifyToken,
} from '../middlewares/auth.middleware.js';

const router = Router();

const CATEGORIES = [
  'Smartphone',
  'Laptop & PC',
  'AC',
  'Refrigerator',
  'TV',
  'Washing Machine',
  'Electrical',
];
const SERVICE_MODES = ['Home Visit', 'Shop Drop-off'];

// Fields the public keyword search looks at.
const SEARCHABLE_FIELDS = [
  'title',
  'category',
  'technicianName',
  'technicianEmail',
  'serviceArea',
  'serviceMode',
];

const REQUIRED_CREATE_FIELDS = [
  'title',
  'category',
  'description',
  'image',
  'estimatedDuration',
  'serviceMode',
  'serviceArea',
];
const EDITABLE_FIELDS = [
  'title',
  'category',
  'description',
  'image',
  'basePrice',
  'estimatedDuration',
  'serviceMode',
  'serviceArea',
  'isAvailable',
];
const REQUIRED_EDIT_TEXT_FIELDS = ['title', 'description', 'image', 'estimatedDuration', 'serviceArea'];

async function addTechnicianImages(data) {
  const emails = [...new Set(data.map((service) => service.technicianEmail).filter(Boolean))];
  if (emails.length === 0) return data;

  const technicians = await users()
    .find({ email: { $in: emails } }, { projection: { email: 1, image: 1 } })
    .toArray();
  const imageByEmail = new Map(technicians.map(({ email, image }) => [email, image]));

  return data.map((service) => ({
    ...service,
    technicianImage: imageByEmail.get(service.technicianEmail) ?? '',
  }));
}

/** Escapes regex symbols so search text is matched literally (e.g. "laptop (dell)"). */
function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Every field in `fields` must be a non-empty string.
 * When `skipUndefined` is true, missing fields are simply left out (PATCH).
 */
function requireTextFields(source, fields, { skipUndefined = false } = {}) {
  for (const field of fields) {
    const value = source[field];
    if (skipUndefined && value === undefined) continue;
    if (typeof value !== 'string' || !value.trim()) {
      throw new HttpError(400, `Invalid field: ${field}`);
    }
  }
}

/** Loads one service and makes sure it belongs to the logged-in technician. */
async function findOwnedService(id, user) {
  const oid = toObjectId(id);
  if (!oid) throw new HttpError(404, 'Service not found');

  const service = await services().findOne({ _id: oid });
  if (!service) throw new HttpError(404, 'Service not found');

  if (service.technicianEmail !== user.email) {
    throw new HttpError(403, 'Forbidden: you do not own this service');
  }
  return { oid, service };
}

/**
 * Builds the MongoDB filter and sort for the public Browse Services list.
 * Search, filtering and sorting all happen inside MongoDB.
 */
export function buildServicesListQuery(params = {}) {
  const { search, category, serviceMode, sort } = params;

  // The public page only shows approved and available services.
  const filter = { approvalStatus: 'approved', isAvailable: true };

  // Keyword search across service details and technician info
  // (case-insensitive, literal substring match).
  if (typeof search === 'string' && search.trim()) {
    const rx = new RegExp(escapeRegex(search.trim()), 'i');
    filter.$or = SEARCHABLE_FIELDS.map((field) => ({ [field]: rx }));
  }

  // Category is a whitelisted enum; compare case-insensitively so "ac" still works.
  if (typeof category === 'string' && category.trim()) {
    const match = CATEGORIES.find((c) => c.toLowerCase() === category.trim().toLowerCase());
    if (match) filter.category = match;
  }

  // Same for the Home Visit / Shop Drop-off filter.
  if (typeof serviceMode === 'string' && serviceMode.trim()) {
    const match = SERVICE_MODES.find((m) => m.toLowerCase() === serviceMode.trim().toLowerCase());
    if (match) filter.serviceMode = match;
  }

  // Newest first by default; price sorts use _id as a stable tie-breaker.
  let sortQuery = { createdAt: -1, _id: -1 };
  if (sort === 'price-asc') sortQuery = { basePrice: 1, _id: -1 };
  else if (sort === 'price-desc') sortQuery = { basePrice: -1, _id: -1 };

  return { filter, sort: sortQuery };
}

/** GET /api/services — public list with search, filter and sort. */
router.get('/', async (req, res, next) => {
  try {
    const { filter, sort } = buildServicesListQuery(req.query);
    const data = await addTechnicianImages(
      await services().find(filter).sort(sort).toArray(),
    );
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** GET /api/services/:id — public details (approved + available only). */
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

/** POST /api/services — technician adds a service; it starts as pending. */
router.post('/', verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const body = req.body ?? {};
    const {
      title,
      category,
      description,
      image,
      basePrice,
      estimatedDuration,
      serviceMode,
      serviceArea,
    } = body;

    requireTextFields(body, REQUIRED_CREATE_FIELDS);

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

    res.status(201).json({
      success: true,
      message: 'Service added, waiting for admin approval',
      data: doc,
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/services/my/all — technician's own services (any approval status). */
router.get('/my/all', verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const data = await services()
      .find({ technicianEmail: user.email })
      .sort({ createdAt: -1 })
      .toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/services/:id — technician edits own service; approval resets to pending. */
router.patch('/:id', verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const { oid } = await findOwnedService(req.params.id, user);
    const body = req.body ?? {};

    // Copy only fields the technician is allowed to change.
    const updates = {};
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) updates[field] = body[field];
    }

    // No schema layer exists, so every rule is enforced here.
    requireTextFields(updates, REQUIRED_EDIT_TEXT_FIELDS, { skipUndefined: true });

    if (updates.category !== undefined && !CATEGORIES.includes(updates.category)) {
      throw new HttpError(400, 'Invalid category');
    }
    if (updates.serviceMode !== undefined && !SERVICE_MODES.includes(updates.serviceMode)) {
      throw new HttpError(400, 'Invalid service mode');
    }
    if (
      updates.basePrice !== undefined &&
      (typeof updates.basePrice !== 'number' || updates.basePrice <= 0)
    ) {
      throw new HttpError(400, 'basePrice must be a positive number');
    }
    if (updates.isAvailable !== undefined && typeof updates.isAvailable !== 'boolean') {
      throw new HttpError(400, 'isAvailable must be a boolean');
    }

    // Any content edit needs admin approval again; toggling availability does not.
    if (body.isAvailable === undefined) {
      updates.approvalStatus = 'pending';
    }
    updates.updatedAt = new Date();

    await services().updateOne({ _id: oid }, { $set: updates });
    const updated = await services().findOne({ _id: oid });

    res.json({
      success: true,
      message: 'Service updated (re-approval required)',
      data: updated,
    });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/services/:id — technician deletes own service. */
router.delete('/:id', verifyToken, verifyTechnician, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const { oid } = await findOwnedService(req.params.id, user);

    await services().deleteOne({ _id: oid });
    res.json({ success: true, message: 'Service deleted' });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/services/:id/approval and /api/admin/services/:id/approval. */
export async function updateServiceApproval(req, res, next) {
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
}

router.patch('/:id/approval', verifyToken, verifyAdmin, updateServiceApproval);

/** GET /api/services/admin/all — admin sees all services (any status). */
router.get('/admin/all', verifyToken, verifyAdmin, async (_req, res, next) => {
  try {
    const data = await services().find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

export default router;
