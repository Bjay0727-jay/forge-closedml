import { useState } from 'react';
import { Layout, type PageKey } from './components/Layout';
import { DashboardPage } from './pages/Dashboard';
import { ModelsPage } from './pages/Models';
import { EndpointsPage } from './pages/Endpoints';
import { InferenceLogsPage } from './pages/InferenceLogs';
import { AuditEventsPage } from './pages/AuditEvents';
import { PolicyViolationsPage } from './pages/PolicyViolations';

export default function App() {
  const [page, setPage] = useState<PageKey>('dashboard');
  return (
    <Layout page={page} onNavigate={setPage}>
      {page === 'dashboard' && <DashboardPage />}
      {page === 'models' && <ModelsPage />}
      {page === 'endpoints' && <EndpointsPage />}
      {page === 'inference' && <InferenceLogsPage />}
      {page === 'audit' && <AuditEventsPage />}
      {page === 'violations' && <PolicyViolationsPage />}
    </Layout>
  );
}
