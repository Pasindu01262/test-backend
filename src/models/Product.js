import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    description: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    /** Public image URLs; first item is primary (uploads served from /uploads) */
    images: [{ type: String }],
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    stock: { type: Number, required: true, min: 0, default: 0 },
    featured: { type: Boolean, default: false },
    /** Cached average from reviews (updated when reviews change) */
    ratingAvg: { type: Number, default: 0, min: 0, max: 5 },
    numReviews: { type: Number, default: 0 },
    /** Popularity: order count for sorting */
    soldCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model('Product', productSchema);
