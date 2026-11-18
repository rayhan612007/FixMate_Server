import { Router } from 'express';
import { HttpError } from '../middlewares/auth.middleware.js';

const router = Router();

const IMGBB_UPLOAD_URL = 'https://api.imgbb.com/1/upload';

/**
 * POST /api/upload — proxy for ImgBB so the API key never reaches the browser.
 *
 * Body: { image: base64 string, with or without a "data:image/...;base64," prefix }.
 * This route is public on purpose: the sign-up form uploads an avatar before
 * the account (and its session token) exists. The base64 format is validated,
 * and the JSON body limit in app.js is the only size limit.
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

    const response = await fetch(`${IMGBB_UPLOAD_URL}?key=${apiKey}`, {
      method: 'POST',
      body: form,
    });
    const json = await response.json();

    if (!json.success || !json.data?.url) {
      throw new HttpError(502, json.error?.message ?? 'Image upload failed');
    }

    res.json({ success: true, url: json.data.url });
  } catch (err) {
    next(err);
  }
});

export default router;
