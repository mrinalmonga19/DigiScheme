import { lazy, Suspense, type ReactElement } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './state/app';

const Landing = lazy(() => import('./pages/Landing'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const Results = lazy(() => import('./pages/Results'));
const Schemes = lazy(() => import('./pages/Schemes'));
const SchemeDetail = lazy(() => import('./pages/SchemeDetail'));
const Application = lazy(() => import('./pages/Application'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const LinkChecker = lazy(() => import('./pages/LinkChecker'));
const Settings = lazy(() => import('./pages/Settings'));
const Consent = lazy(() => import('./pages/Consent'));
const Admin = lazy(() => import('./pages/Admin'));

/** Pages that need a session send people to the landing page, where they choose a language and agree to the notice. */
function Guard({ children }: { children: ReactElement }) {
  const { session, ready } = useApp();
  if (!ready) return <p className="p-6 text-center" role="status">…</p>;
  if (!session?.authenticated || !session.user?.consent.dataProcessing.granted) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Suspense fallback={<p className="p-6 text-center" role="status">…</p>}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/chat" element={<Guard><ChatPage /></Guard>} />
        <Route path="/results" element={<Guard><Results /></Guard>} />
        <Route path="/dashboard" element={<Guard><Dashboard /></Guard>} />
        <Route path="/links" element={<LinkChecker />} />
        <Route path="/settings" element={<Guard><Settings /></Guard>} />
        <Route path="/apply/:id" element={<Guard><Application /></Guard>} />
        <Route path="/consent/:id" element={<Consent />} />
        <Route path="/schemes" element={<Schemes />} />
        <Route path="/schemes/:slug" element={<SchemeDetail />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
