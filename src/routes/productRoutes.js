import express from 'express';
import mongoose from 'mongoose';
import { body, query, validationResult } from 'express-validator';
import Product from '../models/Product.js';
import Category from '../models/Category.js';
import { protect, adminOnly } from '../middleware/auth.js';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { slugify } from '../utils/slug.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}${path.extname(file.originalname)}`;
    cb(null, unique);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error('Only image files allowed'));
  },
});

const router = express.Router();

/** GET /api/products — list with search, filter, sort */
router.get(
  '/',
  [
    query('search').optional().trim().escape(),
    query('category').optional().isMongoId(),
    query('minPrice').optional().isFloat({ min: 0 }),
    query('maxPrice').optional().isFloat({ min: 0 }),
    query('minRating').optional().isFloat({ min: 0, max: 5 }),
    query('sort').optional().isIn(['price_asc', 'price_desc', 'popular', 'newest', 'rating']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 48 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Invalid query', errors: errors.array() });
    }
    const {
      search,
      category,
      minPrice,
      maxPrice,
      minRating,
      sort = 'newest',
      page = 1,
      limit = 12,
    } = req.query;

    const filter = {};
    if (search) {
      filter.$or = [
        { name: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
      ];
    }
    if (category) filter.category = category;
    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.price = {};
      if (minPrice !== undefined) filter.price.$gte = Number(minPrice);
      if (maxPrice !== undefined) filter.price.$lte = Number(maxPrice);
    }
    if (minRating !== undefined) {
      filter.ratingAvg = { $gte: Number(minRating) };
    }

    let sortObj = { createdAt: -1 };
    switch (sort) {
      case 'price_asc':
        sortObj = { price: 1 };
        break;
      case 'price_desc':
        sortObj = { price: -1 };
        break;
      case 'popular':
        sortObj = { soldCount: -1 };
        break;
      case 'rating':
        sortObj = { ratingAvg: -1, numReviews: -1 };
        break;
      case 'newest':
      default:
        sortObj = { createdAt: -1 };
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [items, total] = await Promise.all([
      Product.find(filter)
        .populate('category', 'name slug')
        .sort(sortObj)
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      Product.countDocuments(filter),
    ]);

    res.json({
      products: items,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)) || 1,
      total,
    });
  }
);

/** GET featured */
router.get('/featured', async (_req, res) => {
  const products = await Product.find({ featured: true })
    .populate('category', 'name slug')
    .limit(8)
    .lean();
  res.json({ products });
});

/** GET by slug */
router.get('/slug/:slug', async (req, res) => {
  const product = await Product.findOne({ slug: req.params.slug })
    .populate('category', 'name slug')
    .lean();
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

/** GET by id */
router.get('/:id', async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid id' });
  }
  const product = await Product.findById(req.params.id).populate('category', 'name slug').lean();
  if (!product) return res.status(404).json({ message: 'Product not found' });
  res.json(product);
});

/** POST create (admin) — multipart for images */
router.post(
  '/',
  protect,
  adminOnly,
  upload.array('images', 6),
  [
    body('name').trim().notEmpty(),
    body('description').trim().notEmpty(),
    body('price').isFloat({ min: 0 }),
    body('category').isMongoId(),
    body('stock').isInt({ min: 0 }),
    // multipart sends featured as string "true" | "false"
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ message: 'Validation failed', errors: errors.array() });
    }
    const { name, description, price, category, stock, featured } = req.body;
    let slug = slugify(name);
    const exists = await Product.findOne({ slug });
    if (exists) slug = `${slug}-${Date.now()}`;

    // Relative paths served from API /uploads (set PUBLIC_UPLOAD_URL in production if CDN)
    const images = (req.files || []).map((f) => `/uploads/${f.filename}`);

    const product = await Product.create({
      name,
      slug,
      description,
      price: Number(price),
      category,
      stock: Number(stock),
      featured: featured === 'true' || featured === true,
      images: images.length ? images : ['/placeholder-handbag.jpg'],
    });
    const populated = await Product.findById(product._id).populate('category', 'name slug');
    res.status(201).json(populated);
  }
);

/** PUT update */
router.put(
  '/:id',
  protect,
  adminOnly,
  upload.array('images', 6),
  async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: 'Invalid id' });
    }
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Not found' });

    const { name, description, price, category, stock, featured, replaceImages } = req.body;
    if (name) {
      product.name = name;
      product.slug = slugify(name);
    }
    if (description) product.description = description;
    if (price !== undefined) product.price = Number(price);
    if (category) product.category = category;
    if (stock !== undefined) product.stock = Number(stock);
    if (featured !== undefined) product.featured = featured === 'true' || featured === true;

    if (req.files?.length) {
      const newPaths = req.files.map((f) => `/uploads/${f.filename}`);
      if (replaceImages === 'true') {
        product.images = newPaths;
      } else {
        product.images = [...(product.images || []), ...newPaths];
      }
    }

    await product.save();
    const populated = await Product.findById(product._id).populate('category', 'name slug');
    res.json(populated);
  }
);

/** DELETE */
router.delete('/:id', protect, adminOnly, async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) {
    return res.status(400).json({ message: 'Invalid id' });
  }
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: 'Product removed' });
});

export default router;
