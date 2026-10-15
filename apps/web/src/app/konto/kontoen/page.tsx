import type { AccountBinding } from "@lanbort/contracts";
import { getAccountDeletionCheck, listOwnEnvironments } from "@lanbort/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { AccountDeletion } from "@/components/account-deletion";
import { ActionButton } from "@/components/action-button";
import { PageHeader } from "@/components/page-header";
import { hrefFor } from "@/navigation/targets";
import { administrationPageHref } from "@/presentation/environment-admin";
import {
  minimumAccessText,
  ownAccountChoices,
  restingNotice,
} from "@/presentation/account";
import { pageQuery, requirePageAccount } from "@/server/session";

export const metadata: Metadata = { title: "Kontoen din – Lånbort" };

/** What must be finished before the account can be deleted (PS-ADM-004). */
const bindingLabels: Record<AccountBinding["kind"], string> = {
  loan: "Et lån som ikke er avsluttet ennå",
  environment_ownership:
    "Du eier et miljø. Gi eierskapet til en annen eller avvikle miljøet først.",
  case: "En åpen mekling der du er part",
};

/** The names of the environments the account owns, by id. */
type EnvironmentNames = ReadonlyMap<string, string>;

/**
 * One line per binding. An environment is named, since an owner may have
 * several, and leads to its administration, where it is handed over or
 * wound down.
 */
function bindingEntry(
  binding: AccountBinding,
  environmentNames: EnvironmentNames,
): { text: string; href: string | null } {
  if (binding.kind !== "environment_ownership") {
    return {
      text: bindingLabels[binding.kind],
      href: hrefFor({ type: binding.kind, id: binding.resourceId }),
    };
  }

  const name = environmentNames.get(binding.resourceId);

  return {
    text: name
      ? `Du eier miljøet «${name}». Gi eierskapet til en annen eller avvikle miljøet først.`
      : bindingLabels.environment_ownership,
    href: administrationPageHref(binding.resourceId),
  };
}

/**
 * Deleting the account (PS-ADM-004–006): first what still binds it, then
 * what goes, what stays and who is affected (UX-INT-007), and only then
 * the action.
 */
function Deletion({
  bindings,
  environmentNames,
}: {
  bindings: readonly AccountBinding[];
  environmentNames: EnvironmentNames;
}) {
  return (
    <section aria-labelledby="slett">
      <h2 id="slett">Slett kontoen</h2>
      {bindings.length > 0 ? (
        <>
          <p>Før kontoen kan slettes, må dette avsluttes:</p>
          <ul className="entries">
            {bindings.map((binding) => {
              const { text, href } = bindingEntry(binding, environmentNames);

              return (
                <li
                  key={`${binding.kind}-${binding.resourceId}`}
                  className="entry"
                >
                  {href ? <Link href={href}>{text}</Link> : text}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <>
          <p>
            <strong>Dette forsvinner:</strong> profilen og navnet ditt,
            e-postadressen, varslene og varslingsvalgene dine, vennskap og
            venneforespørsler, medlemskapene dine, abonnementer på ting, ting du
            eier alene, og anmeldelser du ennå ikke har skrevet.
          </p>
          <p>
            <strong>Dette består, uten navnet ditt:</strong> lån og forespørsler
            du har vært med i, anmeldelser du har gitt, og spørsmål og svar du
            har skrevet. Blokkeringer består.
          </p>
          <p>
            <strong>Dette påvirker andre:</strong> medeiere beholder ting dere
            eier sammen, og den du har lånt med, kan fortsatt anmelde lånet til
            fristen.
          </p>
          <p className="help">Sletting kan ikke angres.</p>
          <AccountDeletion />
        </>
      )}
    </section>
  );
}

/**
 * The account's own state (PS-ADM-001–006): whether it is active, and
 * taking it out of use, back into use or away for good. An account that is
 * not active sees what it may still do (PS-ADM-002).
 */
export default async function AccountStatePage() {
  const account = await requirePageAccount();
  const choices = ownAccountChoices(account.status);
  const deletion = choices.delete
    ? await pageQuery(getAccountDeletionCheck, {})
    : null;
  const environmentNames: EnvironmentNames = deletion?.bindings.some(
    ({ kind }) => kind === "environment_ownership",
  )
    ? new Map(
        ((await pageQuery(listOwnEnvironments, {})) ?? []).map(
          ({ id, name }) => [id, name],
        ),
      )
    : new Map();
  const notice = restingNotice(account.status);

  return (
    <main>
      <PageHeader title="Kontoen din" />
      {notice ? (
        <p>
          {notice} {minimumAccessText}
        </p>
      ) : (
        <p>Kontoen din er aktiv.</p>
      )}
      {choices.reactivate && (
        <ActionButton
          label="Ta kontoen i bruk igjen"
          path="/api/account/reactivation"
          body={{}}
        />
      )}
      {choices.deactivate && (
        <section aria-labelledby="deaktiver">
          <h2 id="deaktiver">Deaktiver kontoen</h2>
          <p>
            Forespørslene du har sendt avsluttes, ingen kan invitere deg til noe
            nytt, og ting bare du eier, vises ikke for andre.{" "}
            {minimumAccessText} Du kan ta kontoen i bruk igjen når du vil.
          </p>
          <ActionButton
            label="Deaktiver kontoen"
            path="/api/account/deactivation"
            body={{}}
          />
        </section>
      )}
      {deletion && (
        <Deletion
          bindings={deletion.bindings}
          environmentNames={environmentNames}
        />
      )}
    </main>
  );
}
