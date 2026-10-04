import type { Metadata } from "next";
import { LinkDevice } from "@/chat/link-device";

export const metadata: Metadata = {
  title: "Koble til denne enheten – Lånbort",
};

export default function LinkDevicePage() {
  return (
    <main>
      <LinkDevice />
    </main>
  );
}
