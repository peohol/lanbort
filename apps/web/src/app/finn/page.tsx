import type { Metadata } from "next";
import { takesNewActivity } from "@lanbort/domain";
import { requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Finn – Lånbort" };

/**
 * Finn (UX-IA-001): targeted search for objects and discoverable
 * environments. The area exists in the navigation from the start; the
 * search itself comes with its own work package (WP-61).
 */
export default async function FindPage() {
  const account = await requirePageAccount();

  return (
    <main>
      <h1>Finn</h1>
      {takesNewActivity(account.status) ? (
        <p className="quiet">Søk er ikke tilgjengelig ennå.</p>
      ) : (
        // Finding leads to something new, which an account at rest does not
        // start (PS-ADM-002); the server finds nothing for it either.
        <p className="quiet">
          Du kan ikke finne nye ting mens kontoen ikke er aktiv.
        </p>
      )}
    </main>
  );
}
