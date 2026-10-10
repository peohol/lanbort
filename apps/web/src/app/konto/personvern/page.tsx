import { pilotRetention } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { accountStateHref } from "@/navigation/routes";
import { serverEnv } from "@/server/env";
import { requirePageAccount } from "@/server/session";

export const metadata: Metadata = {
  title: "Personvern og sikkerhet – Lånbort",
};

const days = (ms: number) => Math.round(ms / (24 * 60 * 60 * 1000));

/**
 * Who is responsible for the user's data, how long it is kept (OD-0002,
 * docs/implementation/retention.md), who processes it, and where to report
 * something serious (Port D, docs/implementation/pilot-operations.md).
 */
export default async function PrivacyPage() {
  await requirePageAccount();
  const { OPERATOR_NAME: operator, CONTACT_EMAIL: contact } = serverEnv();
  const write = contact ? (
    <>
      skriv til <a href={`mailto:${contact}`}>{contact}</a>
    </>
  ) : (
    "si fra til den som inviterte deg til piloten"
  );

  return (
    <main>
      <PageHeader title="Personvern og sikkerhet" />

      <section aria-labelledby="alvorlig">
        <h2 id="alvorlig">Si fra om noe alvorlig</h2>
        <p>
          Tror du at noen har kommet inn på kontoen din, ser opplysninger de
          ikke skal se, eller bruker Lånbort til å skade noen, {write}. Er noen
          i fare, ring politiet på 112.
        </p>
      </section>

      <section aria-labelledby="ansvar">
        <h2 id="ansvar">Hvem som har ansvaret</h2>
        <p>
          Lånbort er i en lukket pilot.{" "}
          {operator
            ? `${operator} driver Lånbort og er ansvarlig for opplysningene dine.`
            : "Den som driver Lånbort, er ansvarlig for opplysningene dine."}
        </p>
      </section>

      <section aria-labelledby="lagrer">
        <h2 id="lagrer">Hva Lånbort lagrer, og hvor lenge</h2>
        <ul>
          <li>
            Profilen, navnet, e-postadressen og profilbildet ditt, så lenge du
            har kontoen. Sletter du kontoen, forsvinner de fra Lånbort med en
            gang, og fra innloggingen og bildelageret kort etter.
          </li>
          <li>Tingene dine og bildene av dem, til du sletter dem.</li>
          <li>
            Lån, anmeldelser og saker du har vært med i, gjennom hele piloten,
            fordi de også er de andres historikk. Sletter du kontoen, står de
            uten navnet ditt.
          </li>
          <li>
            Varsler i {days(pilotRetention.notificationsMs)} dager. Gjelder
            varselet et lån som fortsatt pågår, står det til lånet er over.
          </li>
          <li>
            Svar du ga for å bli med i et miljø, til{" "}
            {days(pilotRetention.membershipAnswersMs)} dager etter at du gikk
            ut.
          </li>
          <li>
            Backuper i 7 dager. Det du har slettet, kommer ikke tilbake fra en
            backup.
          </li>
        </ul>
      </section>

      <section aria-labelledby="leverandorer">
        <h2 id="leverandorer">Hvem som behandler opplysningene for Lånbort</h2>
        <ul>
          <li>
            Supabase lagrer databasen, innloggingen og bildene, i Stockholm.
          </li>
          <li>Vercel kjører appen, i Stockholm.</li>
          <li>Resend sender e-postene, fra Irland.</li>
        </ul>
        <p>
          De får bare det som trengs for å gjøre jobben, og lagrer det etter
          avtale med Lånbort.
        </p>
      </section>

      <section aria-labelledby="rettigheter">
        <h2 id="rettigheter">Rettighetene dine</h2>
        <p>
          Vil du se, rette eller slette opplysningene om deg, {write}. Kontoen
          kan du slette selv under{" "}
          <Link href={accountStateHref}>Kontoen din</Link>. Mener du at Lånbort
          behandler opplysningene dine feil, kan du klage til{" "}
          <a href="https://www.datatilsynet.no/">Datatilsynet</a>.
        </p>
      </section>
    </main>
  );
}
