import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';

let mongo: MongoMemoryServer;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.NODE_ENV = 'test';
  process.env.MONGODB_URI = mongo.getUri();
  process.env.JWT_ACCESS_SECRET = 'test-access-secret-min-32-characters!!';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-min-32-characters!';
  process.env.CORS_ORIGINS = 'http://localhost:3000';
  process.env.MAIL_DRIVER = 'console';
  process.env.STORAGE_DRIVER = 'local';
  await mongoose.connect(process.env.MONGODB_URI);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

afterEach(async () => {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    await collections[key].deleteMany({});
  }
});
