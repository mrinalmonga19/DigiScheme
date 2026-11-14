import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { api, type SchemeListItem } from '../lib/api';
import { useApp } from '../state/app';

export default function Schemes() {
  const { t, language } = useApp();
  const [list, setList] = useState<SchemeListItem[]>([]);
  const [q, setQ] = useState('');
  useEffect(() => { api.schemes(language).then((r) => setList(r.schemes)).catch(() => setList([])); }, [language]);
  const shown = useMemo(() => list.filter((s) => `${s.name} ${s.officialName}`.toLowerCase().includes(q.toLowerCase())), [list, q]);
  return (
    <Layout>
      <h1 className="mb-3 text-2xl font-extrabold text-brand">{t.ui.allSchemes}</h1>
      <input className="field mb-3" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.ui.allSchemes} aria-label={t.ui.allSchemes} />
      <ul className="flex flex-col gap-2">
        {shown.map((s) => (
          <li key={s.slug}><Link to={`/schemes/${s.slug}`} className="card block hover:bg-brand-50">
            <span className="font-bold text-brand">{s.name}</span>
            <span className="ml-2 text-xs text-slate-500">{s.level === 'central' ? t.ui.central : t.ui.stateLevel}</span>
            <p className="text-base">{s.benefit}</p>
          </Link></li>
        ))}
      </ul>
    </Layout>
  );
}
