import { Link } from "@tanstack/react-router";

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <circle cx="20" cy="12" r="6" fill="var(--deadline)" />
      <path
        d="M8.5 25.5h15a5.5 5.5 0 0 0 .6-10.97A7 7 0 0 0 10.6 16.1 4.75 4.75 0 0 0 8.5 25.5Z"
        fill="var(--primary)"
      />
    </svg>
  );
}

export function Logo({ to = "/" }: { to?: "/" | "/student" | "/rep" }) {
  return (
    <Link to={to} className="flex items-center gap-2 rounded-full pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <LogoMark />
      <span className="font-display text-lg font-semibold tracking-tight">Stress Forecast</span>
    </Link>
  );
}
