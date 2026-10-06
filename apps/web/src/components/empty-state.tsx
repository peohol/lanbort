import type { ReactNode } from "react";

/** Nothing here yet: what that means, and the way to begin, if there is one. */
export function EmptyState({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <p>{children}</p>
      {action}
    </div>
  );
}
