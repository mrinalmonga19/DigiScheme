import { createStore } from '../db';
import { logger } from '../config/logger';
import { missingTranslations, loadSchemes } from './loader';
import { seedStore } from '../services/registry';

/**
 * `npm run seed`: validate schemes.json (zod + link whitelist) and upsert schemes and document types
 * into the configured store. With DB_MODE=memory this only validates, since memory is per-process.
 */
const schemes = loadSchemes();
const store = await createStore();
const res = await seedStore(store);
const gaps = missingTranslations(schemes);
console.log(`Seeded ${res.schemes} schemes and ${res.documentTypes} document types into the ${store.mode} store.`);
if (store.mode === 'memory') logger.warn('DB_MODE=memory: nothing persisted. Set DB_MODE=mongo and MONGO_URI to seed Atlas.');
if (gaps.length) console.log(`Note: ${gaps.length} scheme(s) lack cached translations. Run \`npm run translate\`.`);
process.exit(0);
