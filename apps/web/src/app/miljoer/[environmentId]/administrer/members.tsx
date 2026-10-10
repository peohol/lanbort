import {
  type AdministeredMembership,
  type EnvironmentMemberships,
  type EnvironmentRoles,
  maxModerationReasonLength,
} from "@lanbort/contracts";
import type { ReactNode } from "react";
import { ActionButton } from "@/components/action-button";
import { ConfirmAction } from "@/components/confirm-action";
import { describedBy, Field, helpId } from "@/components/field";
import { MoreActions } from "@/components/more-actions";
import { Tag } from "@/components/tag";
import { formatTime } from "@/presentation/dates";
import {
  describeRoles,
  membershipTask,
  passiveReasonTexts,
} from "@/presentation/environment-admin";
import { memberName } from "./memberships";

/**
 * The environment's members as its administrators see them (PS-ENV-004,
 * PS-ENV-006): who must answer a new requirement by when, who is active
 * and in which role, who is passive and why. Nothing given to the
 * membership process is shown here (UX-PRIV-009). An impartial
 * administrator may remove an active member who holds no role (PS-ENV-021).
 */
export function Members({
  environmentId,
  memberships,
  holders,
  ownUserId,
}: {
  environmentId: string;
  memberships: readonly AdministeredMembership[];
  holders: EnvironmentRoles["holders"];
  ownUserId: string;
}) {
  const roles = new Map(holders.map((holder) => [holder.userId, holder.roles]));
  const active = memberships.filter((m) => membershipTask(m) === "member");
  const passive = memberships.filter((m) => m.state === "passive");
  const transition = active.filter(
    (m) => m.transitionDeadline !== null && m.unmetRequirementIds.length > 0,
  );

  return (
    <>
      <MemberList
        id="nytt-krav"
        heading="Må svare på nytt krav"
        members={transition}
        detail={(member) =>
          `Frist ${formatTime(member.transitionDeadline ?? "")}. Blir passivt medlem hvis kravet ikke er oppfylt da.`
        }
      />
      <MemberList
        id="aktive"
        heading="Aktive"
        members={active}
        name={(member) =>
          member.userId === ownUserId
            ? `${memberName(member)} (deg)`
            : memberName(member)
        }
        detail={(member) => {
          const held = roles.get(member.userId);
          return held ? capitalized(describeRoles(held)) : "Medlem";
        }}
        actions={(member) =>
          member.removable && (
            <RemoveMember environmentId={environmentId} member={member} />
          )
        }
      />
      <MemberList
        id="passive"
        heading="Passive"
        members={passive}
        detail={(member) =>
          member.passiveReason
            ? passiveReasonTexts[member.passiveReason]
            : "Passivt medlem"
        }
        tag={(member) =>
          member.reviewStage !== null && (
            <Tag tone="waiting">Vil bli aktivt igjen</Tag>
          )
        }
      />
    </>
  );
}

const capitalized = (text: string) =>
  text.charAt(0).toLocaleUpperCase("nb") + text.slice(1);

function MemberList({
  id,
  heading,
  members,
  name = memberName,
  detail,
  tag,
  actions,
}: {
  id: string;
  heading: string;
  members: readonly AdministeredMembership[];
  name?: (member: AdministeredMembership) => string;
  detail: (member: AdministeredMembership) => string;
  tag?: (member: AdministeredMembership) => ReactNode;
  actions?: (member: AdministeredMembership) => ReactNode;
}) {
  if (members.length === 0) return null;

  return (
    <section aria-labelledby={id}>
      <h2 id={id}>
        {heading} <span className="count">({members.length})</span>
      </h2>
      <ul className="entries">
        {members.map((member) => {
          const nameId = `medlem-${member.id}`;
          const action = actions?.(member);

          return (
            <li key={member.id} className="entry">
              <strong id={nameId}>{name(member)}</strong>
              <span className="entry-detail">{detail(member)}</span>
              {tag && <span>{tag(member)}</span>}
              {action && (
                <div className="actions" role="group" aria-labelledby={nameId}>
                  {action}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * PS-ENV-021: ending an active membership as a local measure, with a
 * factual reason kept with it. Barring new attempts is a choice of its own.
 * The member is told neutrally, never who reported them.
 */
function RemoveMember({
  environmentId,
  member,
}: {
  environmentId: string;
  member: AdministeredMembership;
}) {
  const name = memberName(member);
  const reasonId = `begrunnelse-${member.id}`;
  const reasonHelp = "Kort og saklig. Lagres med tiltaket.";
  const restrictId = `steng-ute-${member.id}`;

  return (
    <ConfirmAction
      label="Fjern fra miljøet"
      title={`Fjerne ${name} fra miljøet?`}
      consequences={{
        stays: [
          `Lån som er godkjent, fortsetter, og ${name} beholder innsynet som trengs i dem.`,
        ],
        gone: [
          `Tingene til ${name} forsvinner fra miljøet. Forespørsler herfra som ikke er godkjent, avsluttes, som når noen melder seg ut.`,
        ],
        affects: [
          `${name} får nøytral beskjed om tiltaket, hva det betyr, og hvordan ${name} ber om en ny vurdering, men ikke hvem som eventuelt rapporterte.`,
        ],
      }}
      confirmLabel={`Fjern ${name} fra miljøet`}
      path="/api/environments/memberships/remove"
      body={{ environmentId, membershipId: member.id }}
      danger
    >
      <Field id={reasonId} label="Begrunnelse" help={reasonHelp}>
        <textarea
          id={reasonId}
          name="reason"
          rows={3}
          required
          maxLength={maxModerationReasonLength}
          {...describedBy(reasonId, reasonHelp)}
        />
      </Field>
      <div className="checkbox">
        <input
          id={restrictId}
          name="restrict"
          type="checkbox"
          aria-describedby={helpId(restrictId)}
        />
        <label htmlFor={restrictId}>
          {`Steng ${name} også ute fra nye forsøk`}
        </label>
      </div>
      <p id={helpId(restrictId)} className="help">
        {`Et eget valg. Da kan ${name} verken søke eller inviteres før en administrator opphever det.`}
      </p>
    </ConfirmAction>
  );
}

/**
 * Those barred from new attempts (PS-ENV-004), also once the application
 * that was rejected has ended, so an administrator can let them try again.
 * Until then they can neither apply nor be invited. Bars from a stricter
 * type than the administrator was active in are not listed (PS-ENV-009);
 * the step to lift them is always offered, so it never tells whether there
 * are any.
 */
export function Restrictions({
  environmentId,
  restrictions,
}: {
  environmentId: string;
  restrictions: EnvironmentMemberships["restrictions"];
}) {
  return (
    <section aria-labelledby="stengt-ute">
      <h2 id="stengt-ute">
        Stengt ute fra nye forsøk
        {restrictions.length > 0 && (
          <>
            {" "}
            <span className="count">({restrictions.length})</span>
          </>
        )}
      </h2>
      {restrictions.length === 0 ? (
        // Bars from a stricter type may be hidden from this administrator
        // (PS-ENV-009), so an empty list says only what they can see.
        <p className="quiet">Ingen utestengelser du kan se.</p>
      ) : (
        <ul className="entries">
          {restrictions.map((restriction) => {
            const nameId = `utestengt-${restriction.id}`;

            return (
              <li key={restriction.id} className="entry">
                <strong id={nameId}>{memberName(restriction)}</strong>
                <span className="entry-detail">
                  {`Stengt ute ${formatTime(restriction.imposedAt)}. Kan ikke søke eller inviteres.`}
                </span>
                <div className="actions" role="group" aria-labelledby={nameId}>
                  <ActionButton
                    label="Opphev utestengelsen"
                    path="/api/environments/restrictions/lift"
                    body={{ environmentId, restrictionId: restriction.id }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <MoreActions label="Tidligere utestengelser">
        <ConfirmAction
          label="Opphev utestengelser fra før du ble med"
          title="Opphev utestengelser fra før du ble med"
          consequences={{
            gone: [
              "Utestengelser fra da miljøet var mer privat enn du har kjent det, oppheves.",
            ],
            affects: [
              "De det gjelder, kan søke eller inviteres igjen. Hvem de er, og om det finnes noen, vises bare for dem som var med da.",
            ],
          }}
          confirmLabel="Opphev utestengelsene"
          path="/api/environments/restrictions/lift-concealed"
          body={{ environmentId }}
        />
      </MoreActions>
    </section>
  );
}
