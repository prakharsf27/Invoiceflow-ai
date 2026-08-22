import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongodServer: MongoMemoryServer | null = null;

export const connectDB = async (): Promise<void> => {
  const connStr = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/invoiceflow';

  try {
    console.log(`Connecting to MongoDB at: ${connStr.replace(/:([^@]+)@/, ':****@')}`);
    // Attempt standard connection to MongoDB Atlas or local MongoDB
    await mongoose.connect(connStr, { serverSelectionTimeoutMS: 10000 });
    console.log(`✅ MongoDB Connected to host: ${mongoose.connection.host}`);
  } catch (error) {
    console.warn(`⚠️ Primary MongoDB connection failed (${(error as Error).message}). Launching embedded MongoMemoryServer...`);
    try {
      mongodServer = await MongoMemoryServer.create();
      const uri = mongodServer.getUri();
      await mongoose.connect(uri);
      console.log(`✅ Embedded MongoMemoryServer connected successfully at: ${uri}`);
    } catch (memError) {
      console.error(`❌ MongoDB Memory Server Error: ${(memError as Error).message}`);
      process.exit(1);
    }
  }
};
