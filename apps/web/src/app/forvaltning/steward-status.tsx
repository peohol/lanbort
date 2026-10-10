import Link from "next/link";
import { PasskeyConfirm } from "@/components/passkey-actions";
import { StatusCard } from "@/components/status-card";
import { newPasskeyHref } from "@/navigation/stewardship";
import { formatClock } from "@/presentation/dates";
import { stewardStanding } from "@/presentation/stewardship";
import type { Stewardship } from "@/server/stewardship";

/** What the steward's standing allows now, and the one step that opens it. */
export function StewardStatus({
  steward,
  unassigned,
}: {
  steward: Stewardship;
  unassigned: number | null;
}) {
  switch (stewardStanding(steward)) {
    case "setup":
      return (
        <StatusCard
          label="Ikke satt opp"
          tone="attention"
          status="Sett opp passkeys for å bruke forvalterrollen"
          actions={
            <Link className="button button-primary" href={newPasskeyHref}>
              Sett opp passkeys
            </Link>
          }
        >
          <p>
            Som plattformforvalter bekrefter du med passkey i tillegg til
            e-postkoden. Rollen virker når du har to.
          </p>
        </StatusCard>
      );
    case "closed":
      return <TooFewPasskeys steward={steward} />;
    case "unconfirmed":
      return (
        <StatusCard
          label="Bekreft først"
          tone="attention"
          status="Bekreft med passkey for å se og behandle plattformsaker"
          actions={<PasskeyConfirm />}
        >
          <p>
            Å lese og behandle som forvalter krever en bekreftelse fra de siste
            10 minuttene.
            {steward.confirmedAt &&
              ` Du bekreftet sist ${formatClock(steward.confirmedAt)}.`}
          </p>
        </StatusCard>
      );
    case "confirmed":
      return (
        <StatusCard
          label="Bekreftet"
          tone="positive"
          status={
            unassigned === null || unassigned === 0
              ? "Ingen saker venter på en forvalter"
              : `${unassigned} ${unassigned === 1 ? "sak venter" : "saker venter"} på en forvalter`
          }
          when={
            steward.confirmedAt && steward.freshUntil
              ? `Du bekreftet med passkey ${formatClock(steward.confirmedAt)}. Det gjelder til ${formatClock(steward.freshUntil)}.`
              : undefined
          }
        />
      );
  }
}

/** Fewer than two passkeys: steward actions are closed until one is added. */
export function TooFewPasskeys({ steward }: { steward: Stewardship }) {
  const count = steward.passkeys.length;

  return (
    <StatusCard
      label="Stengt"
      tone="warning"
      status={`Under ${steward.minimum} passkeys: forvalterhandlinger er stengt`}
      actions={
        <Link className="button button-primary" href={newPasskeyHref}>
          Legg til en passkey
        </Link>
      }
    >
      <p>
        Du har {count} passkey. Med under {steward.minimum} kan du ikke se eller
        behandle plattformsaker. Legg til én til, helst på en annen enhet eller
        nøkkel, så du har en i reserve.
      </p>
    </StatusCard>
  );
}
