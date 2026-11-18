import { Router } from 'express';
import { HttpError } from '../middlewares/auth.middleware.js';

const router = Router();

/**
 * POST /api/upload — ImgBB upload proxy.
 * Accepts { image: base64 (with or without data: prefix) } so the ImgBB API
 * key stays server-side.
 *
 * This endpoint is intentionally public: the sign-up form uploads an avatar
 * before the account (and therefore session token) exists. The base64 format
 * is validated; there is no application-level size limit (the JSON body
 * parser limit applies).
 */
router.post('/', async (req, res, next) => {
  try {
    const apiKey = process.env.IMGBB_API_KEY;
    if (!apiKey) throw new HttpError(500, 'ImgBB is not configured');

    const { image } = req.body ?? {};
    if (typeof image !== 'string' || !image) {
      throw new HttpError(400, 'image (base64) is required');
    }

    const base64 = image.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '');
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
      throw new HttpError(400, 'image must be valid base64');
    }

    const form = new FormData();
    form.append('image', base64);
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
