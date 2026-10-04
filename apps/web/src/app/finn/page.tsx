import type { Metadata } from "next";
import { requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Finn – Lånbort" };

/**
 * Finn (UX-IA-001): targeted search for objects and discoverable
 * environments. The area exists in the navigation from the start; the
 * search itself comes with its own work package (WP-61).
 */
export default async function FindPage() {
  await requirePageAccount();

  return (
    <main>
      <h1>Finn</h1>
      <p className="quiet">Søk er ikke tilgjengelig ennå.</p>
    </main>
  );
}
