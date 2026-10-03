import type {
  Environment,
  EnvironmentMemberships,
  HomeItem,
  ReviewedPublication,
} from "@lanbort/contracts";
import { type HomeReader, type HomeSource, homeItem } from "../home/source";
import { listOwnObjects } from "../objects/queries";
import { listEnvironmentPublications } from "../publications/queries";
import {
  getEnvironment,
  listMemberships,
  listOwnEnvironments,
} from "./queries";

const targetOf = (environment: Environment) =>
  ({ type: "environment", id: environment.id }) as const;

/**
 * What an environment asks of the caller as a member or invitee
 * (PS-ENV-003–008): an invitation to answer, requirements or a confirmation
 * their membership waits for, a role offered to them, and a proposed weaker
 * type they have not answered. As an administrator, a vacant ownership
 * they may claim before its deadline (PS-ENV-013).
 */
export function environmentHomeItems(environment: Environment): HomeItem[] {
  const target = targetOf(environment);
  const details = { title: environment.name };
  const { membership, typeChange } = environment;
  const vacancy = environment.continuity?.ownershipVacancy;
  const items: HomeItem[] = [];

  if (membership?.reviewStage === "information_requested") {
    items.push(homeItem("environment.answer_requirements", target, details));
  } else if (membership?.reviewStage === "confirmation_required") {
    items.push(homeItem("environment.confirm_membership", target, details));
  } else if (
    membership?.state === "pending" &&
    membership.origin === "invitation" &&
    membership.reviewStage === null
  ) {
    items.push(homeItem("environment.answer_invitation", target, details));
  } else if (
    membership?.state === "active" &&
    membership.transitionDeadline !== null &&
    membership.unmetRequirementIds.length > 0
  ) {
    items.push(
      homeItem("environment.answer_requirements", target, {
        ...details,
        dueAt: membership.transitionDeadline,
      }),
    );
  }

  if (environment.roleInvitations.length > 0) {
    items.push(homeItem("environment.answer_role_invitation", target, details));
  }

  if (typeChange && typeChange.yourResponse === null) {
    items.push(
      homeItem("environment.answer_type_change", target, {
        ...details,
        dueAt: typeChange.deadline,
      }),
    );
  }

  if (
    vacancy &&
    !vacancy.claimedByYou &&
    environment.roles.includes("administrator")
  ) {
    items.push(
      homeItem("environment.claim_ownership", target, {
        ...details,
        dueAt: vacancy.claimDeadline,
      }),
    );
  }

  return items;
}

/**
 * UX-JRN-012: an administrator's waiting tasks, one item per kind with how
 * many there are. What the caller is involved in themselves is not theirs
 * to decide (PS-USR-009), so it is not offered: their own membership, and
 * publications of objects they own.
 */
export function administrationHomeItems(
  environment: Environment,
  tasks: {
    readonly userId: string;
    readonly memberships: EnvironmentMemberships | null;
    readonly pendingPublications: readonly ReviewedPublication[];
    readonly ownObjectIds: ReadonlySet<string>;
  },
): HomeItem[] {
  const target = targetOf(environment);
  const counted = [
    [
      "environment.review_memberships",
      (tasks.memberships?.memberships ?? []).filter(
        (membership) =>
          membership.reviewStage === "submitted" &&
          membership.userId !== tasks.userId,
      ).length,
    ],
    [
      "environment.review_publications",
      tasks.pendingPublications.filter(
        (publication) => !tasks.ownObjectIds.has(publication.objectId),
      ).length,
    ],
  ] as const;

  return counted.flatMap(([kind, count]) =>
    count > 0
      ? [homeItem(kind, target, { title: environment.name, count })]
      : [],
  );
}

/** Every pending publication in the environment, page by page. */
async function pendingPublications(
  { ifAllowed }: HomeReader,
  environmentId: string,
): Promise<ReviewedPublication[]> {
  const publications: ReviewedPublication[] = [];
  let cursor: string | undefined;

  do {
    const page = await ifAllowed(listEnvironmentPublications, {
      environmentId,
      status: "pending",
      cursor,
    });
    publications.push(...(page?.publications ?? []));
    cursor = page?.nextCursor ?? undefined;
  } while (cursor);

  return publications;
}

/**
 * The caller's environments, each read through `environment.read` and,
 * where they administer it, the administrators' own lists. An environment
 * they lose access to meanwhile simply drops out.
 */
export const environmentHomeSource: HomeSource = {
  name: "environments",
  async items(reader) {
    const { actor, query, ifAllowed } = reader;
    const summaries = await query(listOwnEnvironments, {});
    let ownObjectIds: Promise<ReadonlySet<string>> | undefined;
    const items: HomeItem[] = [];

    for (const summary of summaries) {
      const environment = await ifAllowed(getEnvironment, {
        environmentId: summary.id,
      });

      if (!environment) continue;

      items.push(...environmentHomeItems(environment));

      if (!environment.roles.includes("administrator")) continue;

      const pending = await pendingPublications(reader, environment.id);
      ownObjectIds ??=
        pending.length === 0
          ? undefined
          : query(listOwnObjects, {}).then(
              ({ objects }) => new Set(objects.map((object) => object.id)),
            );
      items.push(
        ...administrationHomeItems(environment, {
          userId: actor.kind === "user" ? actor.userId : "",
          memberships: await ifAllowed(listMemberships, {
            environmentId: environment.id,
          }),
          pendingPublications: pending,
          ownObjectIds: (await ownObjectIds) ?? new Set(),
        }),
      );
    }

    return items;
  },
};
