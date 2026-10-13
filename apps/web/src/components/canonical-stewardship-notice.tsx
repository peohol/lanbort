import type { ReactNode } from "react";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";

export function CanonicalStewardshipNotice({
  href,
  back,
}: {
  href: string | null;
  back?: { href: string; label: string };
}) {
  return (
    <main>
      <PageHeader
        title="Forvalterfunksjon"
        kind="Lånbort"
        home="home"
        {...(back ? { back } : {})}
      />
      <StatusCard
        label="Hovedadressen kreves"
        tone="attention"
        status="Forvalterfunksjoner kan ikke brukes via Vercel-adressen"
        actions={
          href ? (
            <a className="button button-primary" href={href}>
              Åpne hovedadressen
            </a>
          ) : undefined
        }
      >
        <p>
          Passkeys for plattformforvaltningen er bundet til hoveddomenet.
          Vercel-adressen kan fortsatt brukes til vanlig appbruk.
        </p>
        <p className="help">
          Innloggingen deles ikke mellom domenene, så du kan måtte logge inn på
          nytt på hovedadressen.
        </p>
      </StatusCard>
    </main>
  );
}
