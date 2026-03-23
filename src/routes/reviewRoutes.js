import express from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Review from '../models/Review.js';
import Product from '../models/Product.js';
import { protect } from '../middleware/auth.js';
import { updateProductRatingStats } from '../utils/productStats.js';

const router = express.Router();

/** GET reviews for product */
router.get('/product/:productId', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.productId)) {
    return res.status(400).json({ message: 'Invalid product' });
  }
  const reviews = await Review.find({ product: req.params.productId })
    .populate('user', 'name')
    .sort({ createdAt: -1 })
    .lean();
  res.json(reviews);
});

/** POST review */
router.post(
  '/',
  protect,
  [
    body('product').isMongoId(),
    body('rating').isInt({ min: 1, max: 5 }),
    body('comment').trim().notEmpty().escape(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { product, rating, comment } = req.body;
    const prod = await Product.findById(product);
    if (!prod) return res.status(404).json({ message: 'Product not found' });

    try {
      const review = await Review.create({
        user: req.user.id,
        product,
        rating,
        comment,
      });
      await updateProductRatingStats(product);
      const populated = await Review.findById(review._id).populate('user', 'name');
      res.status(201).json(populated);
    } catch (e) {
      if (e.code === 11000) {
        return res.status(400).json({ message: 'You already reviewed this product' });
      }
      throw e;
    }
  }
);

router.delete('/:id', protect, async (req, res) => {
  const review = await Review.findById(req.params.id);
  if (!review) return res.status(404).json({ message: 'Not found' });
  if (review.user.toString() !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Forbidden' });
  }
  const productId = review.product;
  await review.deleteOne();
  await updateProductRatingStats(productId);
  res.json({ message: 'Review deleted' });
});

export default router;
