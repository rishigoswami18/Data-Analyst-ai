export default function Card({ children, className = '' }) {
  return <div className={`glass-panel rounded-3xl ${className}`}>{children}</div>;
}
