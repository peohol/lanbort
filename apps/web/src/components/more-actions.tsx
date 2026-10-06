import type { ReactNode } from "react";

/**
 * The rarer steps, in the same place everywhere (UX-INT-009): closed until
 * asked for, reachable by keyboard, and never the only way to the page's
 * main step.
 */
export function MoreActions({
  label = "Flere valg",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <details className="more-actions">
      <summary>{label}</summary>
      <div role="group" aria-label={label}>
        {children}
      </div>
    </details>
  );
}
