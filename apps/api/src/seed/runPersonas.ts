import { createContext } from '../context';
import { runAllPersonas } from '../personas/runner';
import { createMemoryStore } from '../db/memory';

/** `npm run personas`: play all four demo personas offline (memory store, mock providers) and print a report. */
const reports = await runAllPersonas(() => createContext({ store: createMemoryStore() }));
let failed = 0;
for (const r of reports) {
  console.log(`\n=== ${r.persona} (${r.language}, ${r.channel}) ${r.ok ? 'PASS' : 'FAIL'} ===`);
  for (const s of r.steps) console.log(`  ${String(s.step).padStart(2)}. [${s.kind}] ${s.input.slice(0, 70)}\n      → ${s.reply}`);
  for (const f of r.failures) console.log(`  ✗ ${f}`);
  if (!r.ok) failed++;
}
console.log(`\n${reports.length - failed}/${reports.length} personas passed`);
process.exit(failed ? 1 : 0);
