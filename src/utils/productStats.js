import Review from '../models/Review.js';
import Product from '../models/Product.js';

/** Recompute average rating and count for a product */
export async function updateProductRatingStats(productId) {
  const agg = await Review.aggregate([
    { $match: { product: productId } },
    {
      $group: {
        _id: '$product',
        avg: { $avg: '$rating' },
        count: { $sum: 1 },
      },
    },
  ]);
  const stats = agg[0];
  await Product.findByIdAndUpdate(productId, {
    ratingAvg: stats ? Math.round(stats.avg * 10) / 10 : 0,
    numReviews: stats ? stats.count : 0,
  });
}
