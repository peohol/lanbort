import type { InvitableEnvironments } from "@lanbort/contracts";
import { ActionButton } from "@/components/action-button";
import { MenuList, MenuRow } from "@/components/menu-list";
import { environmentHref } from "@/navigation/routes";
import styles from "./person.module.css";

/**
 * «Inviter til …» (PS-ENV-018): the closed and hidden environments the
 * reader administers that may take the person now. The server offers only
 * those, and only for someone the reader may see; nothing when there are
 * none.
 */
export function InviteTo({
  userId,
  name,
  environments,
}: {
  userId: string;
  name: string;
  environments: InvitableEnvironments["environments"];
}) {
  if (environments.length === 0) return null;

  return (
    <section aria-labelledby="inviter" className={styles.section}>
      <h2 id="inviter">Inviter til et miljø du administrerer</h2>
      <p className="help">
        {name} er godkjent på forhånd, men må fortsatt svare på kravene i
        miljøet før personen blir med.
      </p>
      <MenuList label="inviter">
        {environments.map((environment) => (
          <MenuRow
            key={environment.id}
            icon="environment"
            href={environmentHref(environment.id)}
            label={environment.name}
            actions={
              <ActionButton
                label={`Inviter til ${environment.name}`}
                path="/api/environments/memberships/invite"
                body={{ environmentId: environment.id, userId }}
              />
            }
          />
        ))}
      </MenuList>
    </section>
  );
}
