import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { AddPasskeyForm } from "@/components/passkey-actions";
import { StatusCard } from "@/components/status-card";
import { passkeysHref, stewardshipHref } from "@/navigation/stewardship";
import { requirePageAccount } from "@/server/session";
import { requireStewardship } from "@/server/stewardship";
import { StewardRole } from "../../steward-role";

export const metadata: Metadata = { title: "Legg til en passkey – Lånbort" };

/**
 * Adding a passkey (OD-0023): the first with the enrollment code the
 * operator gave in person or on the phone, the second right after it from
 * the session the first one confirmed, and later ones after a fresh
 * confirmation with one the steward has.
 */
export default async function NewPasskeyPage() {
  await requirePageAccount();
  const steward = await requireStewardship();

  if (!steward.enabled) notFound();

  const count = steward.passkeys.length;
  const fresh = steward.freshUntil !== null;
  const settingUp = count < steward.minimum;
  const back = settingUp
    ? { href: stewardshipHref, label: "Forvaltning" }
    : { href: passkeysHref, label: "Passkeys" };

  return (
    <main>
      <PageHeader
        title={settingUp ? "Sett opp passkeys" : "Legg til en passkey"}
        back={back}
        task
      />
      <StewardRole steward={steward} />
      {count >= steward.maximum ? (
        <StatusCard
          status={`Du har ${steward.maximum} passkeys, så mange som er lov`}
          tone="neutral"
        >
          <p>Fjern en du ikke bruker, før du legger til en ny.</p>
        </StatusCard>
      ) : count === 0 ? (
        <>
          <p className="page-kind">Steg 1 av 2: Første passkey</p>
          <p>
            Som plattformforvalter bekrefter du med passkey i tillegg til
            e-postkoden. Rollen virker når du har to.
          </p>
          <AddPasskeyForm
            key={count}
            needsCode
            fresh={fresh}
            submitLabel="Lag passkey"
            done={null}
          />
        </>
      ) : settingUp ? (
        <>
          <p className="page-kind">Steg 2 av 2: Andre passkey</p>
          <StatusCard
            label="Den første er lagt til"
            tone="positive"
            status="Legg til én til, så virker forvalterrollen"
          >
            <p>
              {fresh
                ? "Du har nettopp bekreftet med passkey, så de neste 10 minuttene kan du legge til den andre uten kode."
                : "Du bekrefter med den første passkeyen før du lager den andre."}{" "}
              Bruk en annen enhet eller nøkkel, så du har en i reserve.
            </p>
          </StatusCard>
          <AddPasskeyForm
            key={count}
            needsCode={false}
            fresh={fresh}
            submitLabel={
              fresh ? "Legg til passkey nr. 2" : "Bekreft og lag passkey"
            }
            done={passkeysHref}
          />
          <p className="link-row">
            <Link href={stewardshipHref}>Senere</Link>
          </p>
        </>
      ) : (
        <>
          <p>
            Bruk en annen enhet eller nøkkel enn de du har. Samme passkey kan
            ikke legges til to ganger.
          </p>
          <AddPasskeyForm
            key={count}
            needsCode={false}
            fresh={fresh}
            submitLabel={fresh ? "Lag passkey" : "Bekreft og lag passkey"}
            done={passkeysHref}
          />
        </>
      )}
    </main>
  );
}
