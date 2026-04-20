export default function Input({ className = '', ...props }) {
  return (
    <input
      className={[
        'h-12 w-full rounded-2xl border border-outline bg-slate-950/90 px-4 text-sm text-ink outline-none transition placeholder:text-slate-500 focus:border-accent-400 focus:ring-4 focus:ring-accent-500/10',
        className
      ].join(' ')}
      {...props}
    />
  );
}
