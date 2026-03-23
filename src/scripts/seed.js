/**
 * Seed categories and sample products. Run: npm run seed
 * Requires MONGODB_URI in .env
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Category from '../models/Category.js';
import Product from '../models/Product.js';
import User from '../models/User.js';
import { slugify } from '../utils/slug.js';

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('Set MONGODB_URI');
    process.exit(1);
  }
  await mongoose.connect(uri);

  await Category.deleteMany({});
  await Product.deleteMany({});

  const cats = await Category.insertMany([
    { name: 'Totes', slug: 'totes', description: 'Spacious everyday totes' },
    { name: 'Crossbody', slug: 'crossbody', description: 'Hands-free crossbody bags' },
    { name: 'Clutches', slug: 'clutches', description: 'Evening clutches' },
    { name: 'Shoulder Bags', slug: 'shoulder-bags', description: 'Classic shoulder styles' },
  ]);

  const tote = cats.find((c) => c.slug === 'totes');
  const cross = cats.find((c) => c.slug === 'crossbody');

  const samples = [
    {
      name: 'Rose Quartz Leather Tote',
      description:
        'Soft pebbled leather tote in blush pink. Fits laptop and daily essentials. Interior zip pocket.',
      price: 189,
      images: [
        'https://images.unsplash.com/photo-1590874103328-eac38a683ce7?w=800',
        'https://images.unsplash.com/photo-1584917865442-de89df76afd3?w=800',
      ],
      category: tote._id,
      stock: 24,
      featured: true,
    },
    {
      name: 'Beige Canvas Crossbody',
      description: 'Lightweight canvas with adjustable strap and gold hardware. Perfect for weekends.',
      price: 79,
      images: ['https://images.unsplash.com/photo-1548036328-c9fa89d128fa?w=800'],
      category: cross._id,
      stock: 40,
      featured: true,
    },
    {
      name: 'Ivory Quilted Clutch',
      description: 'Elegant quilted clutch with chain strap. Evening-ready.',
      price: 129,
      images: ['https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?w=800'],
      category: cats.find((c) => c.slug === 'clutches')._id,
      stock: 15,
      featured: true,
    },
    {
      name: 'Taupe Structured Satchel',
      description: 'Structured satchel with top handle and detachable strap. Office chic.',
      price: 219,
      images: ['https://images.unsplash.com/photo-1594223274512-ad4803739b7c?w=800'],
      category: tote._id,
      stock: 12,
      featured: false,
    },
  ];

  for (const s of samples) {
    await Product.create({
      ...s,
      slug: slugify(s.name),
      ratingAvg: 4.5,
      numReviews: 0,
    });
  }

  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@bellesac.com').toLowerCase();
  const existing = await User.findOne({ email: adminEmail });
  if (!existing) {
    // Plain password — User model pre-save hashes it
    await User.create({
      name: 'Store Admin',
      email: adminEmail,
      password: 'Admin123!',
      role: 'admin',
      isVerified: true,
    });
    console.log(`Admin user created: ${adminEmail} / Admin123!`);
  } else {
    console.log('Admin user already exists');
  }

  console.log('Seed complete.');
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
