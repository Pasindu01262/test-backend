import express from 'express';
import { body, validationResult } from 'express-validator';
import Category from '../models/Category.js';
import { protect, adminOnly } from '../middleware/auth.js';
import { slugify } from '../utils/slug.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  const categories = await Category.find().sort({ name: 1 }).lean();
  res.json(categories);
});

router.post(
  '/',
  protect,
  adminOnly,
  [body('name').trim().notEmpty(), body('description').optional().trim()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    const { name, description = '' } = req.body;
    let slug = slugify(name);
    const dup = await Category.findOne({ slug });
    if (dup) slug = `${slug}-${Date.now()}`;
    const cat = await Category.create({ name, slug, description });
    res.status(201).json(cat);
  }
);

router.put(
  '/:id',
  protect,
  adminOnly,
  async (req, res) => {
    const cat = await Category.findById(req.params.id);
    if (!cat) return res.status(404).json({ message: 'Not found' });
    if (req.body.name) {
      cat.name = req.body.name;
      cat.slug = slugify(req.body.name);
    }
    if (req.body.description !== undefined) cat.description = req.body.description;
    await cat.save();
    res.json(cat);
  }
);

router.delete('/:id', protect, adminOnly, async (req, res) => {
  await Category.findByIdAndDelete(req.params.id);
  res.json({ message: 'Deleted' });
});

export default router;
