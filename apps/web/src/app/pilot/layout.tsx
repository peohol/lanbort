import type { ReactNode } from "react";
import { requirePilotRole } from "@/server/pilot";

/**
 * The closed pilot's workspace (docs/implementation/pilot-ui.md): only
 * while it is turned on, and only for its lead and participants; anyone
 * else sees «not found». Each page and every action checks again.
 */
export default async function PilotLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requirePilotRole();

  return children;
}
