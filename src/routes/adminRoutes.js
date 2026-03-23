import express from 'express';
import User from '../models/User.js';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import { protect, adminOnly } from '../middleware/auth.js';

const router = express.Router();
router.use(protect, adminOnly);

/** List users */
router.get('/users', async (_req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 }).limit(500).lean();
  res.json(users);
});

/** Update user role */
router.patch('/users/:id/role', async (req, res) => {
  const { role } = req.body;
  if (!['customer', 'admin'].includes(role)) {
    return res.status(400).json({ message: 'Invalid role' });
  }
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true }).select('-password');
  if (!user) return res.status(404).json({ message: 'Not found' });
  res.json(user);
});

/** Sales & analytics summary */
router.get('/analytics', async (_req, res) => {
  const [orderAgg, productCount, userCount, revenueAgg] = await Promise.all([
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          revenue: { $sum: '$total' },
        },
      },
    ]),
    Product.countDocuments(),
    User.countDocuments({ role: 'customer' }),
    Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          monthRevenue: { $sum: '$total' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 6 },
    ]),
  ]);

  const stats = orderAgg[0] || { totalOrders: 0, revenue: 0 };
  res.json({
    totalRevenue: stats.revenue || 0,
    totalOrders: stats.totalOrders || 0,
    productCount,
    customerCount: userCount,
    revenueByMonth: revenueAgg,
  });
});

export default router;
