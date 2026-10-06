import type {
  AdministeredMembership,
  Environment,
  EnvironmentRoles,
} from "@lanbort/contracts";
import { ActionButton } from "@/components/action-button";
import { CommandForm } from "@/components/command-form";
import { ConfirmAction } from "@/components/confirm-action";
import { describedBy, Field } from "@/components/field";
import { MoreActions } from "@/components/more-actions";
import { ReauthenticatedAction } from "@/components/reauthenticated-action";
import { formatTime } from "@/presentation/dates";
import { environmentRoleNames } from "@/presentation/environments";
import {
  describeRoles,
  membershipTask,
} from "@/presentation/environment-admin";
import { memberName } from "./memberships-section";

const inviteHelp = "Medlemmet blir administrator når hen godtar.";

/**
 * Who administers the environment (PS-ENV-003, PS-ENV-013): any
 * administrator invites another; only the owner removes one or hands over
 * ownership, the last with a fresh proof of identity. The owner hands over
 * or winds down before leaving the role.
 */
export function RolesSection({
  environment,
  roles,
  members,
  ownUserId,
}: {
  environment: Environment;
  roles: EnvironmentRoles;
  members: readonly AdministeredMembership[];
  ownUserId: string;
}) {
  const environmentId = environment.id;
  const isOwner = environment.roles.includes("owner");
  const handoverPending = roles.invitations.some(
    (invitation) => invitation.role === "owner",
  );
  const candidates = members.filter(
    (member) =>
      membershipTask(member) === "member" &&
      member.userId !== ownUserId &&
      !roles.holders.some((holder) => holder.userId === member.userId) &&
      !roles.invitations.some(
        (invitation) => invitation.userId === member.userId,
      ),
  );

  return (
    <section aria-labelledby="roller">
      <h2 id="roller">Roller</h2>
      <ul className="entries">
        {roles.holders.map((holder) => {
          const nameId = `rolle-${holder.userId}`;
          const name = memberName(holder);
          const self = holder.userId === ownUserId;
          const ownerHere = holder.roles.includes("owner");

          return (
            <li key={holder.userId} className="entry">
              <strong id={nameId}>{self ? `${name} (deg)` : name}</strong>
              <span className="entry-detail">
                {`${describeRoles(holder.roles)}, administrator siden ${formatTime(holder.administratorSince)}`}
              </span>
              <div className="actions" role="group" aria-labelledby={nameId}>
                {isOwner && !self && !handoverPending && (
                  <ReauthenticatedAction
                    label="Gi eierskapet"
                    title={`Gi eierskapet til ${name}`}
                    consequences={{
                      affects: [
                        `${name} blir eier når hen godtar. Til da er du fortsatt eier.`,
                      ],
                      stays: ["Du fortsetter som administrator."],
                    }}
                    confirmLabel={`Tilby eierskapet til ${name}`}
                    path="/api/environments/roles/offer-ownership"
                    body={{ environmentId, userId: holder.userId }}
                  />
                )}
                {isOwner && !self && !ownerHere && (
                  <MoreActions>
                    <ConfirmAction
                      label="Fjern som administrator"
                      title={`Fjern ${name} som administrator`}
                      consequences={{
                        gone: [`${name} kan ikke lenger administrere miljøet.`],
                        stays: [`${name} er fortsatt medlem.`],
                      }}
                      confirmLabel={`Fjern ${name} som administrator`}
                      path="/api/environments/roles/remove-administrator"
                      body={{ environmentId, userId: holder.userId }}
                      danger
                    />
                  </MoreActions>
                )}
                {self && !ownerHere && (
                  <MoreActions>
                    <ConfirmAction
                      label="Gå av som administrator"
                      title="Gå av som administrator"
                      consequences={{
                        gone: ["Du kan ikke lenger administrere miljøet."],
                        stays: ["Du er fortsatt medlem."],
                      }}
                      confirmLabel="Gå av som administrator"
                      path="/api/environments/roles/resign"
                      body={{ environmentId }}
                      danger
                    />
                  </MoreActions>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {isOwner && (
        <p className="help">
          Som eier gir du eierskapet til en annen administrator eller avvikler
          miljøet før du kan gå av.
        </p>
      )}
      {roles.invitations.length > 0 && (
        <>
          <h3>Invitert til en rolle</h3>
          <ul className="entries">
            {roles.invitations.map((invitation) => {
              const nameId = `rolleinvitasjon-${invitation.id}`;
              const mayWithdraw = invitation.role !== "owner" || isOwner;

              return (
                <li key={invitation.id} className="entry">
                  <strong id={nameId}>{memberName(invitation)}</strong>
                  <span className="entry-detail">
                    {`${environmentRoleNames[invitation.role]}, invitert ${formatTime(invitation.createdAt)}. Har ikke svart ennå.`}
                  </span>
                  {mayWithdraw && (
                    <div
                      className="actions"
                      role="group"
                      aria-labelledby={nameId}
                    >
                      <ActionButton
                        label="Trekk invitasjonen"
                        path="/api/environments/roles/withdraw"
                        body={{ environmentId, invitationId: invitation.id }}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <h3>Inviter en administrator</h3>
      {candidates.length === 0 ? (
        <p className="quiet">
          Alle aktive medlemmer er allerede administratorer eller invitert.
        </p>
      ) : (
        <CommandForm
          path="/api/environments/roles/invite-administrator"
          fixed={{ environmentId }}
          submitLabel="Inviter som administrator"
          secondary
        >
          <Field id="ny-administrator" label="Medlem" help={inviteHelp}>
            <select
              id="ny-administrator"
              name="userId"
              {...describedBy("ny-administrator", inviteHelp)}
              required
            >
              {candidates.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {memberName(member)}
                </option>
              ))}
            </select>
          </Field>
        </CommandForm>
      )}
    </section>
  );
}
