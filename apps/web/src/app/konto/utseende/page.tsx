import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { requirePageAccount } from "@/server/session";
import { readTheme } from "@/server/theme";
import { ThemeChoice } from "./theme-choice";

export const metadata: Metadata = { title: "Utseende – Lånbort" };

/** Light or dark, or as the device is set. */
export default async function AppearancePage() {
  await requirePageAccount();

  return (
    <main>
      <PageHeader title="Utseende" />
      <ThemeChoice initial={await readTheme()} />
    </main>
  );
}
