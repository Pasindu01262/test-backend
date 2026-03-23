import Stripe from 'stripe';
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { sendMail } from '../utils/email.js';

/**
 * Handles Stripe webhook (checkout.session.completed).
 * Raw body required — registered before express.json() in server.
 */
export async function handleStripeWebhook(req, res) {
  const sig = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const key = process.env.STRIPE_SECRET_KEY;

  if (!secret || !key) {
    return res.status(503).send('Webhook not configured');
  }

  const stripe = new Stripe(key);
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('Stripe webhook signature:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const orderId = session.metadata?.orderId;
    if (!orderId) {
      return res.json({ received: true });
    }

    const order = await Order.findById(orderId);
    if (!order || order.paymentStatus === 'paid') {
      return res.json({ received: true });
    }

    order.paymentStatus = 'paid';
    order.stripePaymentIntentId = session.payment_intent || '';
    order.status = 'processing';
    await order.save();

    for (const line of order.items) {
      await Product.findByIdAndUpdate(line.product, {
        $inc: { stock: -line.quantity, soldCount: line.quantity },
      });
    }

    await Cart.findOneAndUpdate({ user: order.user }, { items: [] });

    const user = await User.findById(order.user);
    if (user?.email) {
      await sendMail({
        to: user.email,
        subject: `Order confirmed — ${order.orderNumber}`,
        html: `<p>Thank you! Your payment was received.</p><p>Order: <strong>${order.orderNumber}</strong></p><p>Total: $${order.total}</p>`,
        text: `Order ${order.orderNumber} confirmed. Total: $${order.total}`,
      });
    }
  }

  res.json({ received: true });
}
