import { takesNewActivity } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { findHref } from "@/navigation/areas";
import { requirePageAccount } from "@/server/session";
import { EnvironmentForm } from "./environment-form";

export const metadata: Metadata = { title: "Opprett miljø – Lånbort" };

/**
 * Creating an environment (WP-84): a context in Finn, not a product of its
 * own (UX-IA-004). An account at rest starts nothing new (PS-ADM-002).
 */
export default async function NewEnvironmentPage() {
  const account = await requirePageAccount();
  const back = { href: `${findHref}?vis=miljoer`, label: "Finn" };

  if (!takesNewActivity(account.status)) {
    return (
      <main>
        <PageHeader title="Opprett et miljø" back={back} />
        <p className="quiet">
          Du kan ikke opprette miljøer mens kontoen ikke er aktiv.
        </p>
      </main>
    );
  }

  return (
    <main>
      <PageHeader title="Opprett et miljø" back={back}>
        Et miljø er en gruppe som låner ut til hverandre, for eksempel et
        borettslag, et nabolag eller en forening. Du blir eier og administrator.
      </PageHeader>
      <EnvironmentForm />
    </main>
  );
}
