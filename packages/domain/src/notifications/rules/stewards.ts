import {
  stewardEnrollmentCodeIssued,
  stewardPasskeyAdded,
  stewardPasskeyRemoved,
} from "../../platform/events";
import { notifyOn, tell } from "../rule";

const ownAccess = (userId: string) =>
  ({ type: "steward_access", id: userId }) as const;

/**
 * Security notices about a platform steward's own passkeys (ADR-0011,
 * OD-0023), told also when the steward acted: whoever has taken over the
 * e-mail account cannot change the passkeys, but the steward must learn at
 * once if someone else did. A reset is told once, by its new code, not per
 * passkey it removed; deleting the account tells nobody.
 */
export const stewardRules = [
  notifyOn(
    stewardPasskeyAdded,
    ({ event }) =>
      tell(
        [event.resourceId],
        "steward.passkeys_changed",
        ownAccess(event.resourceId),
        "added",
      ),
    { tellsActor: true },
  ),
  notifyOn(
    stewardPasskeyRemoved,
    ({ event }) =>
      event.actorUserId === null
        ? []
        : tell(
            [event.resourceId],
            "steward.passkeys_changed",
            ownAccess(event.resourceId),
            "removed",
          ),
    { tellsActor: true },
  ),
  notifyOn(stewardEnrollmentCodeIssued, ({ event, payload }) =>
    tell(
      [event.resourceId],
      "steward.passkeys_changed",
      ownAccess(event.resourceId),
      payload.removedPasskeys > 0 ? "reset" : "enrollment_code",
    ),
  ),
];
