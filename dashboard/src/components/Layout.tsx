import { type ReactNode } from 'react';
import { Activity, Boxes, Database, FileText, LayoutDashboard, ShieldAlert } from 'lucide-react';

export type PageKey = 'dashboard' | 'models' | 'endpoints' | 'inference' | 'audit' | 'violations';

const nav: Array<{ key: PageKey; label: string; Icon: typeof LayoutDashboard }> = [
  { key: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { key: 'models', label: 'Models', Icon: Boxes },
  { key: 'endpoints', label: 'Endpoints', Icon: Database },
  { key: 'inference', label: 'Inference Logs', Icon: Activity },
  { key: 'audit', label: 'Audit Events', Icon: FileText },
  { key: 'violations', label: 'Policy Violations', Icon: ShieldAlert },
];

interface Props {
  page: PageKey;
  onNavigate: (page: PageKey) => void;
  children: ReactNode;
}

export function Layout({ page, onNavigate, children }: Props) {
  return (
    <div className="min-h-screen flex">
      <aside className="w-60 shrink-0 border-r border-[color:var(--color-navy-light)] bg-[color:var(--color-navy-mid)]">
        <div className="px-5 py-6">
          <div className="font-mono text-[color:var(--color-teal)] text-lg">FORGE</div>
          <div className="text-xs text-[color:var(--color-gray-300)] uppercase tracking-widest">Closed ML</div>
        </div>
        <nav className="px-2 space-y-1">
          {nav.map(({ key, label, Icon }) => {
            const active = key === page;
            return (
              <button
                key={key}
                onClick={() => onNavigate(key)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded text-sm transition-colors ${
                  active
                    ? 'bg-[color:var(--color-teal-dim)] text-[color:var(--color-teal)]'
                    : 'text-[color:var(--color-gray-200)] hover:bg-[color:var(--color-navy-light)]'
                }`}
              >
                <Icon size={16} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      </aside>
      <main className="flex-1 min-w-0 px-8 py-6 max-w-[1400px]">{children}</main>
    </div>
  );
}
