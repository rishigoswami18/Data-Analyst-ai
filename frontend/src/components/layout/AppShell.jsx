import { useRef } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { BarChart3, Database, LayoutDashboard, Menu, UploadCloud } from 'lucide-react';

import { useAuth } from '../../contexts/AuthContext';
import { useDataset } from '../../contexts/DatasetContext';
import Button from '../ui/Button';
import Card from '../ui/Card';

const navigation = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Upload Dataset', href: '/dashboard', icon: UploadCloud, upload: true },
  { label: 'Analysis', href: '/analysis', icon: BarChart3 }
];

function SidebarLink({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm transition',
        active ? 'bg-accent-500/15 text-white' : 'text-muted hover:bg-white/5 hover:text-white'
      ].join(' ')}
    >
      <Icon className="h-4 w-4" />
      <span>{item.label}</span>
    </button>
  );
}

export default function AppShell({ children }) {
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef(null);
  const { user, logout } = useAuth();
  const { uploadDataset, uploading, currentDataset } = useDataset();

  async function handleFileSelection(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      await uploadDataset(file);
      navigate('/analysis');
    } catch (error) {
      window.alert(error.message);
    } finally {
      event.target.value = '';
    }
  }

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

  function triggerUpload() {
    fileInputRef.current?.click();
  }

  const content = children || <Outlet />;

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[280px_minmax(0,1fr)]">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={handleFileSelection}
      />

      <aside className="hidden border-r border-outline bg-slate-950/45 px-5 py-6 backdrop-blur-xl lg:flex lg:flex-col">
        <div className="flex items-center gap-3 px-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-500/20 text-accent-400">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-accent-400">AI Analytics</p>
            <h1 className="mt-1 text-lg font-semibold text-white">Data Assistant</h1>
          </div>
        </div>

        <nav className="mt-8 space-y-2">
          {navigation.map((item) => (
            <SidebarLink
              key={item.label}
              item={item}
              active={!item.upload && location.pathname === item.href}
              onClick={() => (item.upload ? triggerUpload() : navigate(item.href))}
            />
          ))}
        </nav>

        <Card className="mt-8 p-5">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Current dataset</p>
          <h2 className="mt-3 text-base font-semibold text-white">
            {currentDataset?.filename || 'No dataset selected'}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted">
            {currentDataset
              ? `${currentDataset.rows.toLocaleString()} rows • ${currentDataset.columns} columns`
              : 'Upload a CSV or XLSX file to unlock the analysis workspace.'}
          </p>
        </Card>
      </aside>

      <div className="flex min-h-screen flex-col">
        <header className="border-b border-outline bg-slate-950/35 px-4 py-4 backdrop-blur-xl sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-outline bg-white/5 text-white lg:hidden"
                onClick={triggerUpload}
                aria-label="Upload dataset"
              >
                <Menu className="h-5 w-5" />
              </button>
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-accent-400">Workspace</p>
                <h2 className="text-lg font-semibold text-white">
                  {location.pathname === '/analysis' ? 'Analysis' : 'Dashboard'}
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden rounded-2xl border border-outline bg-white/5 px-4 py-2 text-right sm:block">
                <p className="text-sm font-medium text-white">{user?.name}</p>
                <p className="text-xs text-muted">{user?.email}</p>
              </div>
              <Button variant="secondary" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 sm:px-6 lg:px-8">{content}</main>
      </div>
    </div>
  );
}
