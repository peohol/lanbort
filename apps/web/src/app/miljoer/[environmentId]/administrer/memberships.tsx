import type {
  AdministeredMembership,
  Environment,
  EnvironmentMemberships,
  SocialContact,
} from "@lanbort/contracts";
import { Fragment, type ReactNode } from "react";
import { ActionButton } from "@/components/action-button";
import { CommandForm } from "@/components/command-form";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { Field } from "@/components/field";
import { MoreActions } from "@/components/more-actions";
import { Tag } from "@/components/tag";
import {
  awaitsDecision,
  membershipStatus,
  membershipTask,
} from "@/presentation/environment-admin";

/** A member's name as administrators see it. */
export const memberName = (membership: { realName: string | null }) =>
  membership.realName ?? "Ukjent navn";

/**
 * Applications, reactivation requests and invitations (PS-ENV-001–006,
 * PS-ENV-010): what waits for a decision first, then what waits for
 * someone else. Answers are shown as information given to the
 * environment's membership process, not as profile data (UX-PRIV-009).
 */
export function Memberships({
  environment,
  memberships: { memberships, restrictions },
  friends,
  ownUserId,
}: {
  environment: Environment;
  memberships: EnvironmentMemberships;
  friends: readonly SocialContact[];
  ownUserId: string;
}) {
  const restricted = new Set(restrictions.map(({ userId }) => userId));
  const byTask = (...tasks: ReturnType<typeof membershipTask>[]) =>
    memberships.filter((membership) =>
      tasks.includes(membershipTask(membership)),
    );
  const deciding = byTask("application", "reactivation").filter(
    (membership) => membership.userId !== ownUserId,
  );
  const confirming = byTask("confirmation");
  const invited = byTask("invitation");
  const nothing = deciding.length + confirming.length + invited.length === 0;

  return (
    <>
      {nothing && <EmptyState>Ingen innmeldinger venter.</EmptyState>}
      <MembershipList
        id="venter-avgjorelse"
        heading="Venter på avgjørelse"
        memberships={deciding}
        environment={environment}
        actions={(membership) => (
          <Decision environment={environment} membership={membership} />
        )}
      />
      <MembershipList
        id="venter-soker"
        heading="Venter på svar fra søkeren"
        memberships={confirming}
        environment={environment}
      />
      <MembershipList
        id="invitert"
        heading="Invitert"
        memberships={invited}
        environment={environment}
        actions={(membership) => (
          <ActionButton
            label="Trekk invitasjonen"
            path="/api/environments/memberships/withdraw-invitation"
            body={{
              environmentId: environment.id,
              membershipId: membership.id,
            }}
          />
        )}
      />
      <Invite
        environment={environment}
        candidates={friends.filter(
          (friend) =>
            friend.userId !== ownUserId &&
            !restricted.has(friend.userId) &&
            !memberships.some(
              (membership) => membership.userId === friend.userId,
            ),
        )}
      />
    </>
  );
}

function MembershipList({
  id,
  heading,
  memberships,
  environment,
  actions,
}: {
  id: string;
  heading: string;
  memberships: readonly AdministeredMembership[];
  environment: Environment;
  actions?: (membership: AdministeredMembership) => ReactNode;
}) {
  if (memberships.length === 0) return null;

  return (
    <section aria-labelledby={id}>
      <h2 id={id}>
        {heading} <span className="count">({memberships.length})</span>
      </h2>
      <ul className="entries">
        {memberships.map((membership) => {
          const nameId = `medlemskap-${membership.id}`;
          const status = membershipStatus(membership);

          return (
            <li key={membership.id} className="entry" id={`m-${membership.id}`}>
              <strong id={nameId}>{memberName(membership)}</strong>
              <span>
                <Tag tone={status.tone}>{status.text}</Tag>
              </span>
              <Answers environment={environment} membership={membership} />
              {actions && (
                <div className="actions" role="group" aria-labelledby={nameId}>
                  {actions(membership)}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What the member gave to the environment's requirements. */
function Answers({
  environment,
  membership,
}: {
  environment: Environment;
  membership: AdministeredMembership;
}) {
  const answered = environment.requirements.flatMap((requirement) => {
    const given = membership.answers.find(
      (answer) => answer.requirementId === requirement.id,
    );
    return given ? [{ requirement, answer: given.answer }] : [];
  });
  const missing = membership.unmetRequirementIds.length;

  if (answered.length === 0 && missing === 0) return null;

  return (
    <details>
      <summary>Svar til miljøets innmelding</summary>
      {answered.length > 0 && (
        <dl className="facts">
          {answered.map(({ requirement, answer }) => (
            <Fragment key={requirement.id}>
              <dt className="message-text">{requirement.text}</dt>
              <dd className="message-text">{answer ?? "Godtatt"}</dd>
            </Fragment>
          ))}
        </dl>
      )}
      {missing > 0 && (
        <p className="waiting">
          {missing === 1
            ? "Mangler svar på ett krav som gjelder nå."
            : `Mangler svar på ${missing} krav som gjelder nå.`}
        </p>
      )}
    </details>
  );
}

/**
 * Approving, asking for more, rejecting, and rejecting for good
 * (PS-ENV-004). Approval needs every current requirement met (PS-ENV-005).
 */
function Decision({
  environment,
  membership,
}: {
  environment: Environment;
  membership: AdministeredMembership;
}) {
  const body = { environmentId: environment.id, membershipId: membership.id };
  const name = memberName(membership);
  const reactivation = membershipTask(membership) === "reactivation";
  const rejected = reactivation
    ? `${name} forblir passivt medlem.`
    : "Søknaden avsluttes.";

  return (
    <>
      {membership.unmetRequirementIds.length === 0 && (
        <ActionButton
          label={`Godkjenn ${name}`}
          path="/api/environments/memberships/approve"
          body={body}
          primary
        />
      )}
      {awaitsDecision(membership) && (
        <ActionButton
          label="Be om mer informasjon"
          path="/api/environments/memberships/request-information"
          body={body}
        />
      )}
      <ConfirmAction
        label="Avvis"
        title={`Avvis ${name}`}
        consequences={{
          gone: [rejected],
          affects: [`${name} kan prøve igjen senere.`],
        }}
        confirmLabel={`Avvis ${name}`}
        path="/api/environments/memberships/reject"
        body={body}
      />
      <MoreActions>
        <ConfirmAction
          label="Avvis og steng ute"
          title={`Avvis og steng ute ${name}`}
          consequences={{
            gone: [rejected],
            affects: [
              `${name} kan ikke prøve igjen før en administrator opphever utestengelsen.`,
            ],
          }}
          confirmLabel={`Avvis og steng ute ${name}`}
          path="/api/environments/memberships/reject"
          body={{ ...body, restrict: true }}
          danger
        />
      </MoreActions>
    </>
  );
}

/**
 * PS-ENV-010: administrators invite existing accounts, here the friends
 * who are neither members nor barred. An open environment needs no
 * invitation.
 */
function Invite({
  environment,
  candidates,
}: {
  environment: Environment;
  candidates: readonly SocialContact[];
}) {
  if (environment.type === "open") {
    return (
      <p className="quiet">
        Alle kan melde seg inn i et åpent miljø, så det trengs ingen invitasjon.
      </p>
    );
  }

  return (
    <section aria-labelledby="inviter">
      <h2 id="inviter">Inviter</h2>
      <p className="help">
        {environment.type === "hidden"
          ? "Bare de dere inviterer, kan bli med i et skjult miljø. Du kan invitere vennene dine."
          : "Du kan invitere vennene dine. Andre kan søke fra miljøets side."}
      </p>
      {candidates.length === 0 ? (
        <p className="quiet">Ingen av vennene dine kan inviteres nå.</p>
      ) : (
        <CommandForm
          path="/api/environments/memberships/invite"
          fixed={{ environmentId: environment.id }}
          submitLabel="Send invitasjon"
          secondary
        >
          <Field id="inviter-venn" label="Venn">
            <select id="inviter-venn" name="userId" required>
              {candidates.map((friend) => (
                <option key={friend.userId} value={friend.userId}>
                  {friend.realName ?? "Ukjent navn"}
                </option>
              ))}
            </select>
          </Field>
        </CommandForm>
      )}
    </section>
  );
}
