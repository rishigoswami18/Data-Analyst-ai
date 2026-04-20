export default function LoadingScreen({ label }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="glass-panel w-full max-w-md rounded-3xl p-10 text-center">
        <div className="mx-auto h-14 w-14 animate-spin rounded-full border-4 border-white/10 border-t-accent-400" />
        <p className="mt-5 text-sm font-medium text-slate-200">{label}</p>
        <p className="mt-2 text-sm text-muted">Loading your workspace and recent dataset context.</p>
      </div>
    </div>
  );
}
