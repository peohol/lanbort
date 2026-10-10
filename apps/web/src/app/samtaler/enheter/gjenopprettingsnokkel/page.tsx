import type { Metadata } from "next";
import { RecoveryKeyPage } from "@/chat/recovery-key-page";

export const metadata: Metadata = {
  title: "Gjenopprettingsnøkkel – Lånbort",
};

export default function RecoveryKeyRoute() {
  return (
    <main>
      <RecoveryKeyPage />
    </main>
  );
}
