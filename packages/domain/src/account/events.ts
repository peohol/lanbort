import { z } from "zod";
import { defineEvent } from "../events/catalog";

/** A verified identity was linked to a new internal account. */
export const accountCreated = defineEvent({
  type: "account.created",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({}),
});

/** Name and 18+ confirmation were given; the account is now active. */
export const registrationCompleted = defineEvent({
  type: "account.registration_completed",
  version: 1,
  kind: "audit",
  resourceType: "user",
  payload: z.strictObject({}),
});
