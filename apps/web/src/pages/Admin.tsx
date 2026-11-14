import { useState } from 'react';
import { Layout } from '../components/Layout';
import { api } from '../lib/api';

interface Overview { counts: Record<string, number>; store: string; schemes: number }
interface Audit { events: Array<{ id: string; eventType: string; toolName: string | null; schemeSlug: string | null; result: string; timestamp: string }> }
interface Schemes { schemes: Array<{ slug: string; name: string; ruleVersion: string; lastVerifiedOn: string; dataQuality: string; machineTranslated: boolean; hasGuide: boolean }> }

/** Operator view (spec 15). English only: it is for the team, not citizens. Shows no chat text or personal values. */
export default function Admin() {
  const [pass, setPass] = useState('');
  const [data, setData] = useState<{ o: Overview; a: Audit; p: unknown; s: Schemes } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    try {
      const [o, a, p, s] = await Promise.all([api.admin<Overview>('/overview', pass), api.admin<Audit>('/audit', pass), api.admin<unknown>('/providers', pass), api.admin<Schemes>('/schemes', pass)]);
      setData({ o, a, p, s }); setError(null);
    } catch { setError('Wrong passcode or the API is not reachable.'); }
  };
  return (
    <Layout wide>
      <h1 className="mb-3 text-2xl font-extrabold text-brand">Admin</h1>
      <form className="mb-4 flex gap-2" onSubmit={(e) => { e.preventDefault(); void load(); }}>
        <input type="password" className="field" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="Admin passcode" aria-label="Admin passcode" />
        <button type="submit" className="btn-primary">Open</button>
      </form>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {data && (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="card"><h2 className="font-bold">Overview</h2><pre className="overflow-auto text-sm">{JSON.stringify(data.o, null, 2)}</pre></section>
          <section className="card"><h2 className="font-bold">Providers</h2><pre className="overflow-auto text-sm">{JSON.stringify(data.p, null, 2)}</pre></section>
          <section className="card md:col-span-2"><h2 className="font-bold">Schemes (data quality)</h2>
            <table className="w-full text-left text-sm"><thead><tr><th>Slug</th><th>Rules</th><th>Verified on</th><th>Quality</th><th>Guide</th></tr></thead>
              <tbody>{data.s.schemes.map((s) => <tr key={s.slug} className="border-t"><td>{s.slug}</td><td>{s.ruleVersion}</td><td>{s.lastVerifiedOn}</td><td>{s.dataQuality}{s.machineTranslated ? ' · MT' : ''}</td><td>{s.hasGuide ? 'yes' : '-'}</td></tr>)}</tbody></table>
          </section>
          <section className="card md:col-span-2"><h2 className="font-bold">Audit log (latest 200)</h2>
            <table className="w-full text-left text-sm"><thead><tr><th>Time</th><th>Event</th><th>Tool</th><th>Scheme</th><th>Result</th></tr></thead>
              <tbody>{data.a.events.map((e) => <tr key={e.id} className="border-t"><td>{e.timestamp.slice(11, 19)}</td><td>{e.eventType}</td><td>{e.toolName ?? ''}</td><td>{e.schemeSlug ?? ''}</td><td>{e.result}</td></tr>)}</tbody></table>
          </section>
        </div>
      )}
    </Layout>
  );
}
