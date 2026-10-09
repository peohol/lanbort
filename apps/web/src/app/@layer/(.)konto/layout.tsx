import type { ReactNode } from "react";
import { Layer } from "@/components/layer";

/** Konto opened from the app: a layer over the screen the user was on. */
export default function AccountLayer({ children }: { children: ReactNode }) {
  return (
    <Layer layer="account" over>
      {children}
    </Layer>
  );
}
