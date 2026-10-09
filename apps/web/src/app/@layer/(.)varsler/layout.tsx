import type { ReactNode } from "react";
import { Layer } from "@/components/layer";

/** Varsler opened from the bell: a layer over the screen the user was on. */
export default function NotificationsLayer({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Layer layer="notifications" over>
      {children}
    </Layer>
  );
}
