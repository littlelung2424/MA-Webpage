import type { ReactNode } from "react";

/** Reusable home-link wrapper for Mission Atlas xD header branding. */
export function BrandHomeLink({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <a href="/" className={`ma-brand-home-link ${className}`.trim()} aria-label="Mission Atlas xD home">
      {children}
    </a>
  );
}
