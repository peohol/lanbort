import type { ReactNode } from "react";
import { Layer } from "@/components/layer";

/** Konto reached from outside: the layer over the app's own frame. */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <Layer layer="account" over={false}>
      {children}
    </Layer>
  );
}
