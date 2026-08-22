import mongoose from 'mongoose';

let mongodServer: any = null;

export const connectDB = async (): Promise<void> => {
  const connStr = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/invoiceflow';
  const isProduction = process.env.NODE_ENV === 'production';

  try {
    const maskedUri = connStr.replace(/:([^@]+)@/, ':****@');
    console.log(`Connecting to MongoDB at: ${maskedUri}`);
    await mongoose.connect(connStr, { serverSelectionTimeoutMS: 10000 });
    console.log(`✅ MongoDB Connected to host: ${mongoose.connection.host}`);
  } catch (error: any) {
    console.error(`❌ MongoDB connection error: ${error?.message || error}`);

    // MongoMemoryServer fallback is strictly disabled in production
    if (isProduction) {
      console.error('FATAL: MongoDB Atlas connection failed in production. Refusing to launch MongoMemoryServer.');
      process.exit(1);
    }

    console.warn('⚠️ Development fallback: Launching embedded MongoMemoryServer...');
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongodServer = await MongoMemoryServer.create();
      const uri = mongodServer.getUri();
      await mongoose.connect(uri);
      console.log(`✅ Embedded MongoMemoryServer connected successfully at: ${uri}`);
    } catch (memError: any) {
      console.error(`❌ MongoMemoryServer launch failed: ${memError?.message || memError}`);
      process.exit(1);
    }
  }
};
