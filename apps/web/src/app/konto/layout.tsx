import type { ReactNode } from "react";
import { Layer } from "@/components/layer";

/** Konto reached from outside: the layer with nothing under it. */
export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <Layer layer="account" over={false}>
      {children}
    </Layer>
  );
}
