import type {
  CaseInterventions,
  PlatformIntervention,
  PlatformInterventionKind,
} from "@lanbort/contracts";
import { personIn } from "./cases";

/**
 * Platform stewards' interventions as their handlers read them on the case
 * (PS-ADM-014–015, «Plattformforvaltning v1»): what was done, and to whom.
 */
export const interventionLabels: Record<PlatformInterventionKind, string> = {
  account_suspended: "Suspendert konto",
  account_reinstated: "Gjeninnsatt konto",
  account_closure_started: "Startet kontrollert avslutning",
  account_closure_completed: "Fullført kontrollert avslutning",
  account_retired_as_duplicate: "Avviklet som duplikat",
  accounts_linked_as_same_person: "Koblet som samme person",
  false_identity_recorded: "Registrert falsk identitet",
  object_moved_from_duplicate: "Flyttet en ting fra duplikatet",
  environment_roles_ended: "Avsluttet rollene i et miljø",
};

/** «Gjelder»: the account, and what else the intervention names. */
export function interventionSubject(
  item: PlatformIntervention,
  names: Pick<CaseInterventions, "people" | "environments" | "objects">,
): string {
  const person = (userId: string | null) => personIn(names.people, userId);
  const subject = person(item.userId);

  switch (item.kind) {
    case "account_retired_as_duplicate":
      return `${subject}, videreføres som ${person(item.otherUserId)}`;
    case "accounts_linked_as_same_person":
      return `${subject} og ${person(item.otherUserId)}`;
    case "object_moved_from_duplicate": {
      const title = names.objects.find(({ id }) => id === item.objectId)?.title;
      return title ? `«${title}» fra ${subject}` : `En ting fra ${subject}`;
    }
    case "environment_roles_ended": {
      const environment = names.environments.find(
        ({ id }) => id === item.environmentId,
      )?.name;
      return environment ? `${subject} i ${environment}` : subject;
    }
    default:
      return subject;
  }
}

/** «Besluttet av»: the reader themself, or the steward by name. */
export const decidedBy = (
  item: PlatformIntervention,
  people: CaseInterventions["people"],
  userId: string,
) =>
  item.decidedByUserId === userId
    ? "Deg"
    : personIn(people, item.decidedByUserId, "En forvalter");
