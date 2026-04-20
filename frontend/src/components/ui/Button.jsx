export default function Button({
  children,
  className = '',
  variant = 'primary',
  size = 'md',
  isLoading = false,
  ...props
}) {
  const variantClasses = {
    primary: 'bg-accent-500 text-white hover:bg-accent-400',
    secondary: 'border border-outline bg-white/5 text-ink hover:bg-white/10',
    ghost: 'text-muted hover:bg-white/5 hover:text-ink'
  };

  const sizeClasses = {
    sm: 'h-10 px-4 text-sm',
    md: 'h-11 px-5 text-sm',
    lg: 'h-12 px-6 text-base'
  };

  return (
    <button
      className={[
        'inline-flex items-center justify-center gap-2 rounded-2xl font-medium transition duration-200 disabled:cursor-not-allowed disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className
      ].join(' ')}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/35 border-t-white" />
          <span>Working...</span>
        </>
      ) : (
        children
      )}
    </button>
  );
}
