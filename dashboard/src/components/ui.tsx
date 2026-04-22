import { type ReactNode } from 'react';

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-[color:var(--color-navy-light)] bg-[color:var(--color-navy-mid)] ${className}`}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-6">
      <div>
        <h1 className="text-2xl font-semibold text-[color:var(--color-gray-100)]">{title}</h1>
        {subtitle && <p className="text-sm text-[color:var(--color-gray-300)] mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs uppercase tracking-wider text-[color:var(--color-gray-300)]">{label}</div>
      <div className="text-2xl font-mono text-[color:var(--color-gray-100)] mt-1">{value}</div>
      {hint && <div className="text-xs text-[color:var(--color-gray-500)] mt-1">{hint}</div>}
    </Card>
  );
}

const severityTone: Record<string, string> = {
  info: 'bg-[color:var(--color-teal-dim)] text-[color:var(--color-teal)]',
  warning: 'bg-amber-500/15 text-amber-400',
  error: 'bg-red-500/15 text-red-400',
  critical: 'bg-red-500/25 text-red-300',
};

const statusTone: Record<string, string> = {
  online: 'bg-green-500/15 text-green-400',
  offline: 'bg-red-500/15 text-red-400',
  degraded: 'bg-amber-500/15 text-amber-400',
  maintenance: 'bg-[color:var(--color-teal-dim)] text-[color:var(--color-teal)]',
  production: 'bg-green-500/15 text-green-400',
  approved: 'bg-[color:var(--color-teal-dim)] text-[color:var(--color-teal)]',
  staged: 'bg-amber-500/15 text-amber-400',
  dev: 'bg-[color:var(--color-navy-light)] text-[color:var(--color-gray-200)]',
  quarantined: 'bg-red-500/25 text-red-300',
};

export function Badge({ tone, children }: { tone?: string; children: ReactNode }) {
  const cls =
    (tone && severityTone[tone]) ||
    (tone && statusTone[tone]) ||
    'bg-[color:var(--color-navy-light)] text-[color:var(--color-gray-200)]';
  return <span className={`inline-block px-2 py-0.5 rounded text-xs font-mono ${cls}`}>{children}</span>;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'sm',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  const base = 'rounded font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const sizes = { sm: 'px-3 py-1.5 text-sm', md: 'px-4 py-2 text-sm' };
  const variants = {
    primary: 'bg-[color:var(--color-teal)] text-[color:var(--color-navy-deep)] hover:opacity-90',
    secondary: 'bg-[color:var(--color-navy-light)] text-[color:var(--color-gray-100)] hover:bg-[color:var(--color-navy-light)]/80',
    danger: 'bg-red-500/20 text-red-300 hover:bg-red-500/30',
    ghost: 'text-[color:var(--color-gray-200)] hover:bg-[color:var(--color-navy-light)]',
  };
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${sizes[size]} ${variants[variant]}`}>
      {children}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full bg-[color:var(--color-navy-deep)] border border-[color:var(--color-navy-light)] rounded px-3 py-1.5 text-sm text-[color:var(--color-gray-100)] focus:outline-none focus:border-[color:var(--color-teal)] ${props.className || ''}`}
    />
  );
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <select
      {...props}
      className={`bg-[color:var(--color-navy-deep)] border border-[color:var(--color-navy-light)] rounded px-2 py-1.5 text-sm text-[color:var(--color-gray-100)] focus:outline-none focus:border-[color:var(--color-teal)] ${props.className || ''}`}
    >
      {props.children}
    </select>
  );
}

export function DataTable<T extends Record<string, unknown>>({
  rows,
  columns,
  empty = 'No records.',
}: {
  rows: T[];
  columns: Array<{ key: string; label: string; render?: (row: T) => ReactNode; className?: string }>;
  empty?: string;
}) {
  if (!rows.length) return <div className="text-sm text-[color:var(--color-gray-300)] py-6 text-center">{empty}</div>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wider text-[color:var(--color-gray-300)] border-b border-[color:var(--color-navy-light)]">
            {columns.map((c) => (
              <th key={c.key} className={`px-3 py-2 font-medium ${c.className || ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-[color:var(--color-navy-light)]/50 hover:bg-[color:var(--color-navy-light)]/30">
              {columns.map((c) => (
                <td key={c.key} className={`px-3 py-2 align-top ${c.className || ''}`}>
                  {c.render ? c.render(r) : String(r[c.key] ?? '')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded border border-red-500/30 bg-red-500/10 text-red-300 px-3 py-2 text-sm mb-4">
      {error}
    </div>
  );
}

export function Loading() {
  return <div className="text-sm text-[color:var(--color-gray-300)] py-6 text-center">Loading…</div>;
}
