import express from 'express';
import mongoose from 'mongoose';
import Stripe from 'stripe';
import { body, validationResult } from 'express-validator';
import Order from '../models/Order.js';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { sendMail } from '../utils/email.js';

const router = express.Router();

function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  return new Stripe(key);
}

/** Generate unique order number */
function orderNumber() {
  return `BS-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

/** POST create Stripe Checkout session from cart */
router.post(
  '/create-checkout-session',
  protect,
  [
    body('shippingAddress.fullName').trim().notEmpty(),
    body('shippingAddress.line1').trim().notEmpty(),
    body('shippingAddress.city').trim().notEmpty(),
    body('shippingAddress.postalCode').trim().notEmpty(),
    body('shippingAddress.country').trim().notEmpty(),
    body('shippingAddress.phone').trim().notEmpty(),
    body('billingDetails.fullName').trim().notEmpty(),
    body('billingDetails.email').isEmail(),
    body('billingDetails.phone').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid form', errors: errors.array() });
    }

    const user = await User.findById(req.user.id);
    if (!user?.isVerified) {
      return res.status(403).json({
        message: 'Please verify your email before checkout. Check your inbox or resend verification.',
      });
    }

    const cart = await Cart.findOne({ user: req.user.id }).populate('items.product');
    if (!cart?.items?.length) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    for (const line of cart.items) {
      const p = line.product;
      if (!p || p.stock < line.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${p?.name || 'item'}` });
      }
    }

    const { shippingAddress, billingDetails } = req.body;
    let subtotal = 0;
    const orderItems = cart.items.map((line) => {
      const p = line.product;
      const price = p.price;
      subtotal += price * line.quantity;
      return {
        product: p._id,
        name: p.name,
        price,
        quantity: line.quantity,
        image: p.images?.[0] || '',
      };
    });

    const order = await Order.create({
      user: req.user.id,
      orderNumber: orderNumber(),
      items: orderItems,
      shippingAddress,
      billingDetails,
      status: 'pending',
      paymentStatus: 'unpaid',
      total: Math.round(subtotal * 100) / 100,
    });

    const stripe = getStripe();
    if (!stripe) {
      return res.status(503).json({
        message: 'Payment not configured. Set STRIPE_SECRET_KEY in .env',
        orderId: order._id,
      });
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: orderItems.map((i) => ({
        price_data: {
          currency: 'usd',
          product_data: {
            name: i.name,
            images: i.image ? [`${clientUrl.replace(/\/$/, '')}${i.image.startsWith('http') ? '' : i.image}`] : [],
          },
          unit_amount: Math.round(i.price * 100),
        },
        quantity: i.quantity,
      })),
      success_url: `${clientUrl}/orders?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${clientUrl}/checkout?cancelled=1`,
      customer_email: billingDetails.email,
      metadata: {
        orderId: order._id.toString(),
      },
    });

    order.stripeSessionId = session.id;
    await order.save();

    res.json({ url: session.url, sessionId: session.id });
  }
);

/** GET my orders — before /:id */
router.get('/my', protect, async (req, res) => {
  const orders = await Order.find({ user: req.user.id })
    .sort({ createdAt: -1 })
    .populate('items.product', 'name images slug')
    .lean();
  res.json(orders);
});

/** Admin: all orders — must be before /:id */
router.get('/admin/all', protect, adminOnly, async (_req, res) => {
  const orders = await Order.find()
    .sort({ createdAt: -1 })
    .populate('user', 'name email')
    .populate('items.product', 'name')
    .limit(200)
    .lean();
  res.json(orders);
});

/** PATCH cancel (customer: only pending/processing) */
router.patch('/:id/cancel', protect, async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order) return res.status(404).json({ message: 'Not found' });
  if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  if (!['pending', 'processing'].includes(order.status)) {
    return res.status(400).json({ message: 'Order cannot be cancelled' });
  }
  if (order.paymentStatus === 'paid') {
    // Refund flow would go here — for demo we only cancel pending unpaid
    return res.status(400).json({ message: 'Paid orders: contact support to cancel' });
  }
  order.status = 'cancelled';
  await order.save();
  await sendMail({
    to: (await User.findById(order.user))?.email,
    subject: `Order ${order.orderNumber} cancelled`,
    text: `Your order has been cancelled.`,
  });
  res.json(order);
});

/** Admin: update status */
router.patch('/:id/status', protect, adminOnly, [body('status').isIn(['pending', 'processing', 'shipped', 'delivered', 'cancelled'])], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  const order = await Order.findById(req.params.id).populate('user');
  if (!order) return res.status(404).json({ message: 'Not found' });
  order.status = req.body.status;
  await order.save();
  const email = order.user?.email;
  if (email) {
    await sendMail({
      to: email,
      subject: `Order ${order.orderNumber} — ${order.status}`,
      html: `<p>Your order status is now: <strong>${order.status}</strong>.</p>`,
      text: `Order ${order.orderNumber} status: ${order.status}`,
    });
  }
  res.json(order);
});

/** GET single (owner or admin) */
router.get('/:id', protect, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid id' });
  }
  const order = await Order.findById(req.params.id).populate('items.product');
  if (!order) return res.status(404).json({ message: 'Not found' });
  if (order.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  res.json(order);
});

export default router;
