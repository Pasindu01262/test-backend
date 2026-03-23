import express from 'express';
import mongoose from 'mongoose';
import { body, validationResult } from 'express-validator';
import Cart from '../models/Cart.js';
import Product from '../models/Product.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.use(protect);

/** GET cart */
router.get('/', async (req, res) => {
  let cart = await Cart.findOne({ user: req.user.id }).populate('items.product');
  if (!cart) {
    cart = await Cart.create({ user: req.user.id, items: [] });
  }
  res.json(cart);
});

/** POST add / update line */
router.post(
  '/items',
  [
    body('productId').isMongoId(),
    body('quantity').isInt({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { productId, quantity } = req.body;
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.stock < quantity) {
      return res.status(400).json({ message: 'Not enough stock' });
    }

    let cart = await Cart.findOne({ user: req.user.id });
    if (!cart) cart = await Cart.create({ user: req.user.id, items: [] });

    const idx = cart.items.findIndex((i) => i.product.toString() === productId);
    if (idx >= 0) cart.items[idx].quantity = quantity;
    else cart.items.push({ product: productId, quantity });

    await cart.save();
    const populated = await Cart.findById(cart._id).populate('items.product');
    res.json(populated);
  }
);

/** PATCH quantity */
router.patch(
  '/items/:productId',
  [body('quantity').isInt({ min: 1 })],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { productId } = req.params;
    if (!mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ message: 'Invalid product' });
    }
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    if (product.stock < req.body.quantity) {
      return res.status(400).json({ message: 'Not enough stock' });
    }

    const cart = await Cart.findOne({ user: req.user.id });
    if (!cart) return res.status(404).json({ message: 'Cart empty' });
    const idx = cart.items.findIndex((i) => i.product.toString() === productId);
    if (idx < 0) return res.status(404).json({ message: 'Item not in cart' });
    cart.items[idx].quantity = req.body.quantity;
    await cart.save();
    const populated = await Cart.findById(cart._id).populate('items.product');
    res.json(populated);
  }
);

/** DELETE line */
router.delete('/items/:productId', async (req, res) => {
  const { productId } = req.params;
  const cart = await Cart.findOne({ user: req.user.id });
  if (!cart) return res.status(404).json({ message: 'Cart empty' });
  cart.items = cart.items.filter((i) => i.product.toString() !== productId);
  await cart.save();
  const populated = await Cart.findById(cart._id).populate('items.product');
  res.json(populated);
});

/** DELETE entire cart */
router.delete('/', async (req, res) => {
  await Cart.findOneAndUpdate({ user: req.user.id }, { items: [] });
  res.json({ message: 'Cart cleared' });
});

export default router;
