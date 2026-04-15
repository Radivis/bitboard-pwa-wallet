import type { ReactNode } from 'react';

export function FooterOutboundLink({
  href,
  label,
  children,
}: {
  href: string;
  label: string;
  children: ReactNode;
}) {
  if (!href) {
    return (
      <span
        className="text-gray-500 cursor-not-allowed opacity-60"
        aria-label={`${label} (coming soon)`}
        title="Coming soon"
      >
        {children}
      </span>
    );
  }
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-gray-400 hover:text-matrix transition-colors"
      aria-label={label}
    >
      {children}
    </a>
  );
}
