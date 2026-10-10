import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MenuList, MenuRow } from "@/components/menu-list";
import { PageHeader } from "@/components/page-header";
import { PasskeyConfirm, RemovePasskey } from "@/components/passkey-actions";
import { StatusCard } from "@/components/status-card";
import { newPasskeyHref, stewardshipHref } from "@/navigation/stewardship";
import { formatShortTime } from "@/presentation/dates";
import { enrolledWithText, stewardStanding } from "@/presentation/stewardship";
import { requirePageAccount } from "@/server/session";
import { requireStewardship, type Stewardship } from "@/server/stewardship";
import { StewardRole } from "../steward-role";
import { StewardStatus } from "../steward-status";

export const metadata: Metadata = { title: "Passkeys – Lånbort" };

/**
 * The steward's passkeys (ADR-0011, OD-0023): name, when and how each was
 * added and when it was last used. A lost one is removed after confirming
 * with another; the last one cannot be removed, and losing all is the
 * operator's reset, never anything in the app.
 */
export default async function PasskeysPage() {
  await requirePageAccount();
  const steward = await requireStewardship();

  if (!steward.enabled) notFound();

  const { passkeys, minimum, maximum } = steward;
  const fresh = steward.freshUntil !== null;
  const standing = stewardStanding(steward);

  return (
    <main>
      <PageHeader
        title="Passkeys"
        back={{ href: stewardshipHref, label: "Forvaltning" }}
      />
      <StewardRole steward={steward} />
      {standing === "confirmed" || standing === "unconfirmed" ? (
        <Standing steward={steward} />
      ) : (
        <StewardStatus steward={steward} unassigned={null} />
      )}
      {passkeys.length > 0 && (
        <section aria-labelledby="dine">
          <h2 id="dine">
            Dine passkeys <span className="count">· {passkeys.length}</span>
          </h2>
          <MenuList label="dine">
            {passkeys.map((passkey) => (
              <MenuRow
                key={passkey.id}
                icon="lock"
                label={passkey.name}
                detail={
                  <>
                    Lagt til {formatShortTime(passkey.createdAt)}{" "}
                    {enrolledWithText[passkey.enrolledWith]}
                    {passkey.lastUsedAt && (
                      <>
                        <br />
                        Sist brukt {formatShortTime(passkey.lastUsedAt)}
                      </>
                    )}
                  </>
                }
                actions={
                  passkeys.length > 1 && (
                    <RemovePasskey
                      passkeyId={passkey.id}
                      name={passkey.name}
                      remaining={passkeys.length - 1}
                      minimum={minimum}
                      fresh={fresh}
                    />
                  )
                }
              />
            ))}
          </MenuList>
          {passkeys.length === 1 && (
            <p className="quiet">Den siste passkeyen kan ikke fjernes.</p>
          )}
        </section>
      )}
      {standing !== "closed" &&
        passkeys.length > 0 &&
        passkeys.length < maximum && (
          <section aria-labelledby="legg-til">
            <h2 id="legg-til">Legg til en passkey</h2>
            <p className="quiet">
              Krever at du har bekreftet med passkey de siste 10 minuttene. Har
              du ikke det, bekrefter du først.
            </p>
            <p>
              <Link className="button" href={newPasskeyHref}>
                Legg til en passkey
              </Link>
            </p>
          </section>
        )}
      <p className="quiet">
        Du får varsel, også på e-post, når en passkey legges til eller fjernes,
        og når en registreringskode lages eller passkeyene dine tilbakestilles.
      </p>
      <section aria-labelledby="mister-alle">
        <h2 id="mister-alle">Mister du alle</h2>
        <p>
          Det finnes ingen gjenoppretting i appen, på e-post eller gjennom
          support. Driftsansvarlig tilbakestiller passkeyene dine og gir deg en
          ny registreringskode ansikt til ansikt eller på telefon. Rollen din
          består, men virker først når du har lagt til to nye.
        </p>
      </section>
    </main>
  );
}

/** Enough passkeys: whether this session's confirmation still counts. */
function Standing({ steward }: { steward: Stewardship }) {
  const count = steward.passkeys.length;
  const status = `${count} aktive passkeys`;
  const explained = (
    <p>
      Du trenger minst {steward.minimum}. Mister du én, bekrefter du med en
      annen, fjerner den du mistet og legger til en ny.
    </p>
  );

  return steward.strong ? (
    <StatusCard
      label="Forvalterhandlingene er åpne"
      tone="positive"
      status={status}
    >
      {explained}
    </StatusCard>
  ) : (
    <StatusCard
      label="Ikke bekreftet"
      status={status}
      actions={<PasskeyConfirm primary={false} />}
    >
      {explained}
    </StatusCard>
  );
}
