import type { DocumentCode, DocumentType, Scheme } from '@digischeme/shared';
import type { Store } from '../db/store';
import { loadDocumentTypes, loadSchemes } from '../seed/loader';
import { checkUrl } from '../trust/whitelist';

/**
 * In-process read model of schemes and document types. Loaded once at boot from the store
 * (seeding it first if empty), so request handlers never hit the database for static data.
 */
export class Registry {
  private schemes = new Map<string, Scheme>();
  private docs = new Map<DocumentCode, DocumentType>();

  constructor(schemes: Scheme[], docs: DocumentType[]) {
    for (const s of schemes) this.schemes.set(s.slug, s);
    for (const d of docs) this.docs.set(d.code, d);
  }

  all(): Scheme[] {
    return [...this.schemes.values()];
  }
  get(slug: string): Scheme | undefined {
    return this.schemes.get(slug);
  }
  doc(code: DocumentCode): DocumentType | undefined {
    return this.docs.get(code);
  }
  docTypes(): DocumentType[] {
    return [...this.docs.values()];
  }
  /** Official links re-checked at request time; a link that fails is simply not shown. */
  safeLinks(scheme: Scheme): Array<{ label: string; url: string }> {
    return scheme.officialLinks.filter((l) => checkUrl(l.url).official);
  }
}

/** Upsert the validated seed into the store. Idempotent. */
export async function seedStore(store: Store): Promise<{ schemes: number; documentTypes: number }> {
  const schemes = loadSchemes();
  const docs = loadDocumentTypes();
  for (const s of schemes) await store.schemes.updateOne({ _id: s.slug }, { ...s, _id: s.slug }, { upsert: true });
  for (const d of docs) await store.documentTypes.updateOne({ _id: d.code }, { ...d, _id: d.code }, { upsert: true });
  return { schemes: schemes.length, documentTypes: docs.length };
}

export async function buildRegistry(store: Store): Promise<Registry> {
  if ((await store.schemes.count({})) === 0 || store.mode === 'memory') await seedStore(store);
  const schemes = (await store.schemes.find({})).map(({ _id, createdAt, updatedAt, ...s }) => s as Scheme);
  const docs = (await store.documentTypes.find({})).map(({ _id, createdAt, updatedAt, ...d }) => d as DocumentType);
  return new Registry(schemes, docs);
}
