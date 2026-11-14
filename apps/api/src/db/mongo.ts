import mongoose, { type Model } from 'mongoose';
import { buildModels } from '../models/index';
import { logger } from '../config/logger';
import type { BaseDoc, Collection, Filter, FindOptions, Store } from './store';

/** Thin adapter from a Mongoose model to the Collection interface. Always returns plain objects. */
class MongoCollection<T extends BaseDoc> implements Collection<T> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(private model: Model<any>) {}

  private plain(doc: unknown): T {
    const o = doc as Record<string, unknown>;
    for (const k of ['createdAt', 'updatedAt']) {
      if (o[k] instanceof Date) o[k] = (o[k] as Date).toISOString();
    }
    return o as T;
  }

  async insert(doc: T): Promise<T> {
    const created = await this.model.create(doc);
    return this.plain(created.toObject());
  }
  async findOne(filter: Filter<T>): Promise<T | null> {
    const d = await this.model.findOne(filter).lean();
    return d ? this.plain(d) : null;
  }
  async find(filter: Filter<T>, opts: FindOptions<T> = {}): Promise<T[]> {
    let q = this.model.find(filter);
    if (opts.sort) q = q.sort({ [opts.sort.field as string]: opts.sort.dir });
    if (opts.limit !== undefined) q = q.limit(opts.limit);
    return (await q.lean()).map((d) => this.plain(d));
  }
  async updateOne(filter: Filter<T>, patch: Partial<T>, opts: { upsert?: boolean } = {}): Promise<T | null> {
    const d = await this.model
      .findOneAndUpdate(filter, { $set: patch }, { new: true, upsert: opts.upsert ?? false, setDefaultsOnInsert: true })
      .lean();
    return d ? this.plain(d) : null;
  }
  async deleteMany(filter: Filter<T>): Promise<number> {
    return (await this.model.deleteMany(filter)).deletedCount ?? 0;
  }
  async count(filter: Filter<T>): Promise<number> {
    return this.model.countDocuments(filter);
  }
}

export async function createMongoStore(uri: string): Promise<Store> {
  // Fail fast instead of buffering commands while Mongo is down: the API layer turns the error
  // into a friendly message, and the driver reconnects on its own when Mongo returns.
  const conn = await mongoose
    .createConnection(uri, { serverSelectionTimeoutMS: 5000, bufferCommands: false })
    .asPromise();
  conn.on('disconnected', () => logger.warn('MongoDB disconnected; driver will retry'));
  conn.on('reconnected', () => logger.info('MongoDB reconnected'));
  const m = buildModels(conn);
  await Promise.all(Object.values(m).map((model) => model.init().catch(() => undefined)));
  return {
    mode: 'mongo',
    users: new MongoCollection(m.users),
    profiles: new MongoCollection(m.profiles),
    schemes: new MongoCollection(m.schemes),
    documentTypes: new MongoCollection(m.documentTypes),
    sessions: new MongoCollection(m.sessions),
    applications: new MongoCollection(m.applications),
    trackers: new MongoCollection(m.trackers),
    audit: new MongoCollection(m.audit),
    consents: new MongoCollection(m.consents),
    dedupe: new MongoCollection(m.dedupe),
    media: new MongoCollection(m.media),
    healthy: async () => conn.readyState === 1,
    close: async () => {
      await conn.close();
    },
  };
}
