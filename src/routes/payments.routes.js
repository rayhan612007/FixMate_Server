import { Router } from 'express';
import Stripe from 'stripe';
import { HttpError, getCurrentUser, verifyAdmin, verifyCustomer } from '../middlewares/auth.middleware.js';
import { bookings } from '../models/Booking.js';
import { payments } from '../models/Payment.js';
import { toObjectId } from '../db.js';

const router = Router();

/** Creates a Stripe client, but only for test-mode keys. */
function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith('sk_test_')) {
    throw new HttpError(500, 'Stripe is not configured (test mode key missing)');
  }
  return new Stripe(key);
}

/** Stripe returns either a string id or an expanded object for payment_intent. */
function paymentIntentId(session) {
  return typeof session.payment_intent === 'string'
    ? session.payment_intent
    : session.payment_intent?.id;
}

/**
 * Saves a paid session exactly once.
 *
 * Both the success page and the Stripe webhook call this method, so they can
 * race. The unique index on `stripeSessionId` is the final guarantee; the
 * checks here just avoid unnecessary writes.
 */
export async function savePaymentFromSession(session) {
  const alreadySaved = await payments().findOne({ stripeSessionId: session.id });
  if (alreadySaved) return 'duplicate';

  const bookingId = session.metadata?.bookingId;
  if (!bookingId) throw new HttpError(400, 'Session metadata is missing bookingId');

  const bookingOid = toObjectId(bookingId);
  if (!bookingOid) throw new HttpError(404, 'Booking not found for this payment');

  const booking = await bookings().findOne({ _id: bookingOid });
  if (!booking) throw new HttpError(404, 'Booking not found for this payment');

  // Mark the booking as paid only once.
  if (booking.paymentStatus !== 'paid') {
    await bookings().updateOne(
      { _id: bookingOid },
      { $set: { paymentStatus: 'paid', updatedAt: new Date() } },
    );
  }

  // The webhook may have saved the payment while we were updating the booking.
  const savedDuringUpdate = await payments().findOne({ stripeSessionId: session.id });
  if (savedDuringUpdate) return 'duplicate';

  try {
    await payments().insertOne({
      bookingId,
      serviceTitle: booking.serviceTitle,
      customerName: booking.customerName,
      customerEmail: booking.customerEmail,
      technicianName: booking.technicianName,
      technicianEmail: booking.technicianEmail,
      amount: booking.finalAmount,
      currency: 'usd',
      transactionId: paymentIntentId(session) ?? '',
      stripeSessionId: session.id,
      paymentStatus: 'paid',
      paidAt: new Date(),
    });
  } catch (err) {
    // Duplicate key means the other writer won the race.
    if (err?.code === 11000) return 'duplicate';
    throw err;
  }

  return 'saved';
}

/** POST /api/payments/create-checkout-session — pay a completed, unpaid booking. */
router.post('/create-checkout-session', verifyCustomer, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const { bookingId } = req.body ?? {};

    // Load the booking server-side; never trust an amount sent by the client.
    const bookingOid = toObjectId(String(bookingId ?? ''));
    const booking = bookingOid ? await bookings().findOne({ _id: bookingOid }) : null;
    if (!booking) throw new HttpError(404, 'Booking not found');

    if (booking.customerEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: you do not own this booking');
    }
    if (booking.status !== 'completed' || booking.paymentStatus !== 'unpaid') {
      throw new HttpError(400, 'Payment is only allowed for a completed and unpaid booking');
    }

    const stripe = getStripe();
    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      // Prefill from the authenticated account. Stripe renders this email as
      // read-only, so customers cannot pay with (or change to) another address.
      customer_email: user.email,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: 'usd',
            unit_amount: Math.round(booking.finalAmount * 100), // cents
            product_data: { name: booking.serviceTitle },
          },
        },
      ],
      success_url: `${clientUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/payment/cancel`,
      metadata: {
        bookingId: String(booking._id),
        customerEmail: booking.customerEmail,
      },
    });

    res.json({ success: true, url: session.url });
  } catch (err) {
    next(err);
  }
});

/** GET /api/payments/verify?session_id=... — success-page verification. */
router.get('/verify', verifyCustomer, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const sessionId = req.query.session_id;
    if (typeof sessionId !== 'string' || !sessionId) {
      throw new HttpError(400, 'session_id is required');
    }

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== 'paid') {
      throw new HttpError(400, 'Payment is not completed yet');
    }
    if (session.metadata?.customerEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: this payment does not belong to you');
    }

    const result = await savePaymentFromSession(session);
    const bookingOid = toObjectId(session.metadata?.bookingId);
    const booking = bookingOid ? await bookings().findOne({ _id: bookingOid }) : null;

    res.json({
      success: true,
      duplicate: result === 'duplicate',
      message: result === 'duplicate' ? 'Payment was already recorded' : 'Payment recorded',
      data: {
        amount: booking?.finalAmount,
        transactionId: paymentIntentId(session),
        booking,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/payments/my — customer payment history. */
router.get('/my', verifyCustomer, async (req, res, next) => {
  try {
    const user = getCurrentUser(req);
    const data = await payments()
      .find({ customerEmail: user.email })
      .sort({ paidAt: -1 })
      .toArray();
    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
});

/** GET /api/payments/admin/all — admin transactions plus total revenue. */
router.get('/admin/all', verifyAdmin, async (_req, res, next) => {
  try {
    const data = await payments().find({}).sort({ paidAt: -1 }).toArray();
    const totalRevenue = data.reduce((sum, payment) => sum + payment.amount, 0);
    res.json({ success: true, totalRevenue, data });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/webhook — Stripe webhook (raw body, signature-verified).
 * Registered before express.json() in app.js and idempotent through
 * savePaymentFromSession().
 */
export async function stripeWebhook(req, res) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).send('Webhook secret is not configured');
    return;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'], secret);
  } catch {
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await savePaymentFromSession(event.data.object);
    }
    res.json({ received: true });
  } catch {
    res.status(500).send('Webhook handler failed');
  }
}

export default router;
