import { Request, Response, NextFunction, Router } from 'express';
import Stripe from 'stripe';
import { HttpError, verifyAdmin, verifyCustomer } from '../middlewares/auth.middleware';
import { AuthRequest } from '../types/express';
import { Booking } from '../models/Booking';
import { Payment } from '../models/Payment';

const router = Router();

function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key || !key.startsWith('sk_test_')) {
    throw new HttpError(500, 'Stripe is not configured (test mode key missing)');
  }
  return new Stripe(key);
}

function requireUser(req: Request) {
  if (!req.user) throw new HttpError(401, 'Unauthorized');
  return req.user;
}

/**
 * Idempotent payment saving — called by BOTH the success-page verification and
 * the Stripe webhook. The same payment must never be saved twice
 * (uniqueness enforced on stripeSessionId, checked again here).
 */
export async function savePaymentFromSession(session: Stripe.Checkout.Session): Promise<'saved' | 'duplicate'> {
  const existing = await Payment.findOne({ stripeSessionId: session.id });
  if (existing) return 'duplicate';

  const bookingId = session.metadata?.bookingId;
  if (!bookingId) throw new HttpError(400, 'Session metadata is missing bookingId');

  const booking = await Booking.findById(bookingId);
  if (!booking) throw new HttpError(404, 'Booking not found for this payment');

  // Mark the booking paid (only once)
  if (booking.paymentStatus !== 'paid') {
    booking.paymentStatus = 'paid';
    await booking.save();
  }

  // Re-check after marking paid (webhook + verify may race)
  const dup = await Payment.findOne({ stripeSessionId: session.id });
  if (dup) return 'duplicate';

  await Payment.create({
    bookingId,
    serviceTitle: booking.serviceTitle,
    customerName: booking.customerName,
    customerEmail: booking.customerEmail,
    technicianName: booking.technicianName,
    technicianEmail: booking.technicianEmail,
    amount: booking.finalAmount,
    currency: 'usd',
    transactionId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id ?? '',
    stripeSessionId: session.id,
    paymentStatus: 'paid',
    paidAt: new Date(),
  });
  return 'saved';
}

/** POST /api/payments/create-checkout-session — customer pays a completed & unpaid booking */
router.post('/create-checkout-session', verifyCustomer, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const { bookingId } = req.body ?? {};

    // Never trust amounts from the client — load the booking server-side
    const booking = await Booking.findById(typeof bookingId === 'string' ? bookingId : String(bookingId ?? ''));
    if (!booking) throw new HttpError(404, 'Booking not found');
    if (booking.customerEmail !== user.email) {
      throw new HttpError(403, 'Forbidden: you do not own this booking');
    }
    // Payment gate: completed + unpaid only, exactly once
    if (booking.status !== 'completed' || booking.paymentStatus !== 'unpaid') {
      throw new HttpError(400, 'Payment is only allowed for a completed and unpaid booking');
    }

    const stripe = getStripe();
    const clientUrl = process.env.CLIENT_URL ?? 'http://localhost:3000';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
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
      metadata: { bookingId: String(booking._id), customerEmail: booking.customerEmail },
    });
    res.json({ success: true, url: session.url });
  } catch (err) {
    next(err);
  }
});

/** GET /api/payments/verify?session_id=... — success-page verification */
router.get('/verify', verifyCustomer, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
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
    const booking = await Booking.findById(session.metadata?.bookingId);
    res.json({
      success: true,
      duplicate: result === 'duplicate',
      message: result === 'duplicate' ? 'Payment was already recorded' : 'Payment recorded',
      data: {
        amount: booking?.finalAmount,
        transactionId: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id,
        booking: booking,
      },
    });
  } catch (err) {
    next(err);
  }
});

/** GET /api/payments/my — customer payment history */
router.get('/my', verifyCustomer, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const user = requireUser(req);
    const payments = await Payment.find({ customerEmail: user.email }).sort({ paidAt: -1 });
    res.json({ success: true, data: payments });
  } catch (err) {
    next(err);
  }
});

/** GET /api/payments/admin/all — admin transactions with total revenue */
router.get('/admin/all', verifyAdmin, async (_req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const payments = await Payment.find().sort({ paidAt: -1 });
    const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
    res.json({ success: true, totalRevenue, data: payments });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/payments/webhook — Stripe webhook (raw body, signature-verified).
 * Mounted BEFORE express.json() in app.ts. Idempotent via savePaymentFromSession.
 */
export async function stripeWebhook(req: Request, res: Response) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    res.status(500).send('Webhook secret is not configured');
    return;
  }
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, req.headers['stripe-signature'] as string, secret);
  } catch {
    res.status(400).send('Webhook signature verification failed');
    return;
  }

  try {
    if (event.type === 'checkout.session.completed') {
      await savePaymentFromSession(event.data.object as Stripe.Checkout.Session);
    }
    res.json({ received: true });
  } catch {
    res.status(500).send('Webhook handler failed');
  }
}

export default router;
