import mongoose from 'mongoose';

/**
 * Connects to MongoDB using Mongoose.
 * Set MONGODB_URI in .env (Atlas connection string).
 */
export async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI is not set in environment variables.');
    process.exit(1);
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri);
  console.log('MongoDB connected');
}
