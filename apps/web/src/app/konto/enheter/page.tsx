import type { Metadata } from "next";
import { DeviceList } from "@/chat/device-list";

export const metadata: Metadata = { title: "Mine enheter – Lånbort" };

export default function DevicesPage() {
  return (
    <main>
      <DeviceList />
    </main>
  );
}
