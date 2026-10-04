import type { OwnAccount } from "@lanbort/contracts";
import { statesBefore, takesNewActivity } from "@lanbort/domain";

type Status = OwnAccount["status"];

/**
 * PS-ADM-002: what an account that is not active still does, said the same
 * way wherever it is shown.
 */
export const minimumAccessText =
  "Du kan fortsatt fullføre lån og saker du allerede er med i, og avvikle det du eier, men ikke starte noe nytt.";

/** Why the account is not active, in the user's words. */
const restingLabels: Partial<Record<Status, string>> = {
  dormant: "Kontoen din er i dvale fordi den ikke har vært i bruk på lenge.",
  deactivated: "Kontoen din er deaktivert.",
  suspended: "Kontoen din er stanset av Lånbort.",
  closing: "Kontoen din er under avslutning.",
};

/**
 * What to tell a signed-in user whose account is not active, or null for an
 * active one. Nothing about why the platform stopped it (UX-EXC-007).
 */
export function restingNotice(status: Status): string | null {
  return takesNewActivity(status) ? null : (restingLabels[status] ?? null);
}

/**
 * The changes the user can make to their own account now, from the same
 * table the server checks (`account/model.ts`); the server decides again.
 */
export function ownAccountChoices(status: Status) {
  const may = (to: Status) => statesBefore(to, "user_request").includes(status);

  return {
    deactivate: may("deactivated"),
    reactivate: may("active"),
    delete: may("deleted"),
  };
}
