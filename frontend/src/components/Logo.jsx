// SafeInbox logo: the app icon, optionally followed by the name.
export default function Logo({ size = 40, withName = true, className = "", nameClassName = "text-2xl" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img src="/logo.svg" width={size} height={size} alt={withName ? "" : "SafeInbox"} className="shrink-0" />
      {withName && <span className={`font-bold tracking-tight ${nameClassName}`}>SafeInbox</span>}
    </span>
  );
}
