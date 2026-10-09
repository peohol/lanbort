import type { ReactNode } from "react";
import { Layer } from "@/components/layer";

/** Varsler reached from outside: the layer with nothing under it. */
export default function NotificationsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <Layer layer="notifications" over={false}>
      {children}
    </Layer>
  );
}
