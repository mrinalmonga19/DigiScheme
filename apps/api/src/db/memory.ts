import type { BaseDoc, Collection, Filter, FindOptions, Store } from './store';

function matches<T>(doc: T, filter: Filter<T>): boolean {
  return Object.entries(filter).every(([k, v]) => (doc as Record<string, unknown>)[k] === v);
}

const clone = <T>(v: T): T => structuredClone(v);

/** Simple in-memory collection. Clones on the way in and out so callers cannot mutate stored state. */
export class MemoryCollection<T extends BaseDoc> implements Collection<T> {
  private docs = new Map<string, T>();

  async insert(doc: T): Promise<T> {
    if (this.docs.has(doc._id)) throw new Error(`Duplicate _id ${doc._id}`);
    const now = new Date().toISOString();
    const stored = { ...clone(doc), createdAt: now, updatedAt: now };
    this.docs.set(doc._id, stored);
    return clone(stored);
  }

  async findOne(filter: Filter<T>): Promise<T | null> {
    for (const d of this.docs.values()) if (matches(d, filter)) return clone(d);
    return null;
  }

  async find(filter: Filter<T>, opts: FindOptions<T> = {}): Promise<T[]> {
    let out = [...this.docs.values()].filter((d) => matches(d, filter));
    if (opts.sort) {
      const { field, dir } = opts.sort;
      out = out.sort((a, b) => (a[field] === b[field] ? 0 : a[field]! > b[field]! ? dir : -dir));
    }
    if (opts.limit !== undefined) out = out.slice(0, opts.limit);
    return out.map(clone);
  }

  async updateOne(filter: Filter<T>, patch: Partial<T>, opts: { upsert?: boolean } = {}): Promise<T | null> {
    const existing = [...this.docs.values()].find((d) => matches(d, filter));
    const now = new Date().toISOString();
    if (existing) {
      const next = { ...existing, ...clone(patch), _id: existing._id, updatedAt: now };
      this.docs.set(existing._id, next);
      return clone(next);
    }
    if (!opts.upsert) return null;
    const doc = { ...(filter as object), ...clone(patch) } as T;
    if (!doc._id) throw new Error('upsert requires _id in filter or patch');
    return this.insert(doc);
  }

  async deleteMany(filter: Filter<T>): Promise<number> {
    let n = 0;
    for (const [id, d] of this.docs) {
      if (matches(d, filter)) {
        this.docs.delete(id);
        n++;
      }
    }
    return n;
  }

  async count(filter: Filter<T>): Promise<number> {
    return [...this.docs.values()].filter((d) => matches(d, filter)).length;
  }
}

export function createMemoryStore(): Store {
  return {
    mode: 'memory',
    users: new MemoryCollection(),
    profiles: new MemoryCollection(),
    schemes: new MemoryCollection(),
    documentTypes: new MemoryCollection(),
    sessions: new MemoryCollection(),
    applications: new MemoryCollection(),
    trackers: new MemoryCollection(),
    audit: new MemoryCollection(),
    consents: new MemoryCollection(),
    dedupe: new MemoryCollection(),
    media: new MemoryCollection(),
    healthy: async () => true,
    close: async () => {},
  };
}
