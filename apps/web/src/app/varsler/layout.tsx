import type { ReactNode } from "react";
import { Layer } from "@/components/layer";

/** Varsler reached from outside: the layer over the app's own frame. */
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
