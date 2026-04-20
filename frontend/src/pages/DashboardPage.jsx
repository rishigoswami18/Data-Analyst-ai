import { useNavigate } from 'react-router-dom';
import { Clock3, FileStack, UploadCloud } from 'lucide-react';

import UploadDropzone from '../components/dashboard/UploadDropzone';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import EmptyState from '../components/ui/EmptyState';
import { useDataset } from '../contexts/DatasetContext';

function formatUploadedAt(timestamp) {
  if (!timestamp) return 'Just now';
  const date = new Date(timestamp);
  return date.toLocaleString();
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { recentDatasets, currentDataset, uploadDataset, uploading, bootstrapping } = useDataset();

  async function handleUpload(file) {
    await uploadDataset(file);
    navigate('/analysis');
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-8 sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
          <div>
            <p className="text-sm uppercase tracking-[0.28em] text-accent-300">Dashboard</p>
            <h1 className="mt-4 text-balance text-4xl font-semibold text-white sm:text-5xl">
              Upload data once, then move straight into analysis.
            </h1>
            <p className="mt-4 max-w-2xl text-sm leading-8 text-muted sm:text-base">
              This dashboard keeps setup simple: upload a dataset, review recent files, and continue into the
              chat-based analysis workspace when you are ready.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => navigate('/analysis')} disabled={!currentDataset}>
                Open analysis
              </Button>
              <Button variant="secondary" size="lg">
                Supported: .csv, .xlsx
              </Button>
            </div>
          </div>

          <div className="grid gap-4 rounded-[28px] border border-outline bg-white/5 p-5">
            <div className="rounded-3xl border border-outline bg-slate-950/70 p-5">
              <p className="text-xs uppercase tracking-[0.22em] text-muted">Selected dataset</p>
              <h2 className="mt-3 text-xl font-semibold text-white">
                {currentDataset?.filename || 'No active dataset yet'}
              </h2>
              <p className="mt-2 text-sm leading-7 text-muted">
                {currentDataset
                  ? `${currentDataset.rows.toLocaleString()} rows • ${currentDataset.columns} columns`
                  : 'Upload a file to unlock the analysis workspace and recent activity.'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <UploadDropzone onFileSelect={handleUpload} uploading={uploading} />

      <Card className="p-6 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm uppercase tracking-[0.24em] text-accent-300">Recent datasets</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Recent uploads</h2>
          </div>
        </div>

        <div className="mt-6">
          {bootstrapping ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="h-40 animate-pulse rounded-3xl border border-outline bg-white/5" />
              ))}
            </div>
          ) : recentDatasets.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {recentDatasets.map((dataset) => (
                <div
                  key={dataset.id}
                  className="rounded-3xl border border-outline bg-slate-950/55 p-5 transition hover:-translate-y-0.5 hover:border-accent-400/35"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-400">
                      <FileStack className="h-5 w-5" />
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-full border border-outline bg-white/5 px-3 py-1 text-xs text-muted">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatUploadedAt(dataset.uploaded_at)}
                    </div>
                  </div>
                  <h3 className="mt-4 line-clamp-2 text-lg font-semibold text-white">{dataset.filename}</h3>
                  <p className="mt-2 text-sm leading-7 text-muted">
                    {dataset.rows.toLocaleString()} rows • {dataset.columns} columns • {dataset.numeric_columns} numeric
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={UploadCloud}
              title="No datasets uploaded yet"
              description="Start by uploading a CSV or XLSX file. The dashboard will keep your most recent datasets here for quick reference."
            />
          )}
        </div>
      </Card>
    </div>
  );
}
