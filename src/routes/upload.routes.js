import { Router } from 'express';
import { HttpError, verifyToken } from '../middlewares/auth.middleware.js';

const router = Router();

/**
 * POST /api/upload — ImgBB upload proxy.
 * Accepts { image: base64 (no data: prefix) } so the ImgBB API key stays server-side.
 */
router.post('/', verifyToken, async (req, res, next) => {
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ImgBB is not configured');

    const { image } = req.body ?? {};
    if (typeof image !== 'string' || !image) {
      throw new HttpError(400, 'image (base64) is required');
    }

    const form = new FormData();
    form.append('image', image);
    const resp = await fetch(`https://api.imgbb.com/1/upload?key=${apiKey}`, {
      method: 'POST',
      body: form,
    });
    const json = await resp.json();
    if (!json.success || !json.data?.url) {
      throw new HttpError(502, json.error?.message ?? 'Image upload failed');
    }
    res.json({ success: true, url: json.data.url });
  } catch (err) {
    next(err);
  }
});

export default router;
