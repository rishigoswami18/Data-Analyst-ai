import { useRef, useState } from 'react';
import { FileSpreadsheet, UploadCloud } from 'lucide-react';

import Button from '../ui/Button';
import Card from '../ui/Card';

export default function UploadDropzone({ onFileSelect, uploading }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  function handleFiles(fileList) {
    const file = fileList?.[0];
    if (file) {
      onFileSelect(file);
    }
  }

  return (
    <Card className="relative overflow-hidden p-8">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accent-500/10 via-transparent to-transparent" />
      <div
        className={[
          'relative rounded-[28px] border border-dashed p-10 text-center transition',
          dragging
            ? 'border-accent-400 bg-accent-500/10'
            : 'border-outline bg-slate-950/55 hover:border-accent-500/40 hover:bg-slate-950/70'
        ].join(' ')}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          handleFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx"
          className="hidden"
          onChange={(event) => handleFiles(event.target.files)}
        />
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-500/15 text-accent-400">
          {uploading ? (
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent-400/30 border-t-accent-400" />
          ) : (
            <UploadCloud className="h-7 w-7" />
          )}
        </div>
        <h3 className="mt-6 text-2xl font-semibold text-white">Upload a dataset</h3>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-muted">
          Drag and drop your file here, or choose a dataset manually. Supported formats: CSV and Excel.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" isLoading={uploading} onClick={() => inputRef.current?.click()}>
            Select file
          </Button>
          <div className="inline-flex items-center gap-2 rounded-2xl border border-outline bg-white/5 px-4 py-3 text-sm text-muted">
            <FileSpreadsheet className="h-4 w-4" />
            <span>.csv and .xlsx</span>
          </div>
        </div>
      </div>
    </Card>
  );
}
