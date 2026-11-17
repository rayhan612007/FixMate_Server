import { Request, Response, NextFunction, Router } from 'express';
import { Service } from '../models/Service';
import { AuthUser, HttpError, verifyAdmin, verifyTechnician } from '../middlewares/auth.middleware';
import { AuthRequest } from '../types/express';

const router = Router();

const CATEGORIES = ['Smartphone', 'Laptop & PC', 'AC', 'Refrigerator', 'TV', 'Washing Machine', 'Electrical'];

function requireUser(req: Request): AuthUser {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user;
}

/** GET /api/services — public list with server-side search, filter, sort */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { search, category, serviceMode, sort } = req.query;

    // Public page only shows approved + available services
    const query: Record<string, unknown> = { approvalStatus: 'approved', isAvailable: true };

    if (typeof search === 'string' && search.trim()) {
      const rx = new RegExp(search.trim(), 'i');
      query.$or = [{ title: rx }, { category: rx }];
    }
    if (typeof category === 'string' && CATEGORIES.includes(category)) {
      query.category = category;
    }
    if (serviceMode === 'Home Visit' || serviceMode === 'Shop Drop-off') {
      query.serviceMode = serviceMode;
    }

    let sortQuery: Record<string, 1 | -1> = { createdAt: -1 }; // newest default
    if (sort === 'price-asc') sortQuery = { basePrice: 1 };
    else if (sort === 'price-desc') sortQuery = { basePrice: -1 };

    const services = await Service.find(query).sort(sortQuery);
    res.json({ success: true, data: services });
  } catch (err) {
    next(err);
  }
});

/** GET /api/services/:id — public details (only approved + available) */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const idStr = typeof id === 'string' ? id : String(id);
    if (!idStr.match(/^[0-9a-fA-F]{24}$/)) throw new HttpError(404, 'Service not found');

    const service = await Service.findOne({
      _id: idStr,
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
router.post('/', verifyTechnician, async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    const service = await Service.create({
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
    });
    res.status(201).json({ success: true, message: 'Service added, waiting for admin approval', data: service });
  } catch (err) {
    next(err);
  }
});

/** GET /api/services/my/all — technician's own services (any approval status) */
router.get('/my/all', verifyTechnician, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const services = await Service.find({ technicianEmail: user.email }).sort({ createdAt: -1 });
    res.json({ success: true, data: services });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/services/:id — technician edits own service; approval resets to pending */
router.patch('/:id', verifyTechnician, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) throw new HttpError(404, 'Service not found');
    if (service.technicianEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: you do not own this service');
    }

    const allowed = ['title', 'category', 'description', 'image', 'basePrice', 'estimatedDuration', 'serviceMode', 'serviceArea', 'isAvailable'] as const;
    for (const field of allowed) {
      if (req.body?.[field] !== undefined) {
        (service as unknown as Record<string, unknown>)[field] = req.body[field];
      }
    }
    if (req.body?.isAvailable === undefined) {
      // any content edit sends the service back to admin approval
      service.approvalStatus = 'pending';
    }
    await service.save();
    res.json({ success: true, message: 'Service updated (re-approval required)', data: service });
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/services/:id — technician deletes own service */
router.delete('/:id', verifyTechnician, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { id } = req.params;
    const service = await Service.findById(id);
    if (!service) throw new HttpError(404, 'Service not found');
    if (service.technicianEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: you do not own this service');
    }
    await service.deleteOne();
    res.json({ success: true, message: 'Service deleted' });
  } catch (err) {
    next(err);
  }
});

/** PATCH /api/services/:id/approval — admin approves/rejects */
router.patch('/:id/approval', verifyAdmin, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { approvalStatus } = req.body ?? {};
    if (approvalStatus !== 'approved' && approvalStatus !== 'rejected') {
      throw new HttpError(400, "approvalStatus must be 'approved' or 'rejected'");
    }
    const service = await Service.findByIdAndUpdate(
      id,
      { approvalStatus },
      { new: true },
    );
    if (!service) throw new HttpError(404, 'Service not found');
    res.json({ success: true, message: `Service ${approvalStatus}`, data: service });
  } catch (err) {
    next(err);
  }
});

/** GET /api/services/admin/all — admin sees all services (any status) */
router.get('/admin/all', verifyAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const services = await Service.find().sort({ createdAt: -1 });
    res.json({ success: true, data: services });
  } catch (err) {
    next(err);
  }
});

export default router;
