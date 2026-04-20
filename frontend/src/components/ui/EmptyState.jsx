export default function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="glass-panel rounded-3xl border-dashed p-10 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-accent-500/15 text-accent-400">
        <Icon className="h-7 w-7" />
      </div>
      <h3 className="mt-5 text-xl font-semibold text-white">{title}</h3>
      <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-muted">{description}</p>
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}
