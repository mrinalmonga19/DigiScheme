import { env } from '../config/env';
import { logger } from '../config/logger';
import { createMemoryStore } from './memory';
import { createMongoStore } from './mongo';
import type { Store } from './store';

export async function createStore(): Promise<Store> {
  if (env.DB_MODE === 'mongo') {
    if (!env.MONGO_URI) throw new Error('DB_MODE=mongo requires MONGO_URI');
    const store = await createMongoStore(env.MONGO_URI);
    logger.info('Connected to MongoDB');
    return store;
  }
  logger.warn('DB_MODE=memory: data lives in this process only and is lost on restart');
  return createMemoryStore();
}

export * from './store';
