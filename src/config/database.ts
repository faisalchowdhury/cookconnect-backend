import dns from 'dns';
import mongoose from 'mongoose';
import { env } from './env';
import { logger } from './logger';

// mongodb+srv:// lookups can fail against some ISP/network DNS resolvers; force a
// resolver that supports SRV records so every entry point (server, seed, scripts) connects.
dns.setServers(['1.1.1.1', '1.0.0.1']);

export async function connectDatabase(uri = env.MONGODB_URI): Promise<typeof mongoose> {
  mongoose.set('strictQuery', true);
  mongoose.connection.on('connected', () => logger.info('MongoDB connected'));
  mongoose.connection.on('error', (err) => logger.error('MongoDB error', { err }));
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected'));

  let attempt = 0;
  const maxAttempts = 5;
  while (attempt < maxAttempts) {
    try {
      await mongoose.connect(uri);
      return mongoose;
    } catch (err) {
      attempt += 1;
      logger.warn(`MongoDB connect attempt ${attempt} failed`, { err });
      if (attempt >= maxAttempts) throw err;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  throw new Error('Unable to connect to MongoDB');
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close();
}
