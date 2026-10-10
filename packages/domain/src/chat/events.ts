import { z } from "zod";
import { defineEvent } from "../events/catalog";

/**
 * Chat events carry ids and codes only: never key material, certificates,
 * ciphertext or anything said (ADR-0010 §12). Sending a message is not an
 * event at all.
 */

/** The account's first chat device, with its first account key. */
export const chatAccountKeyCreated = defineEvent({
  type: "chat.account_key_created",
  version: 1,
  kind: "audit",
  resourceType: "chat_device",
  payload: z.strictObject({}),
});

/**
 * The account key was replaced (ADR-0010 §8): every device under the
 * previous one is shut out, and contacts see that the security code changed.
 */
export const chatAccountKeyReset = defineEvent({
  type: "chat.account_key_reset",
  version: 1,
  kind: "audit",
  resourceType: "chat_device",
  payload: z.strictObject({ previousAccountKeyId: z.uuid() }),
});

/** An existing device linked a new one (ADR-0010 §5). */
export const chatDeviceLinked = defineEvent({
  type: "chat.device_linked",
  version: 1,
  kind: "audit",
  resourceType: "chat_device",
  payload: z.strictObject({ approvedByDeviceId: z.uuid() }),
});

/**
 * The account's chat came back on a new device with the recovery key
 * (ADR-0010 §8): the device is under the same account key, and every other
 * device was revoked.
 */
export const chatAccountRestored = defineEvent({
  type: "chat.account_restored",
  version: 1,
  kind: "audit",
  resourceType: "chat_device",
  payload: z.strictObject({}),
});

/** A device was revoked with a signature from its account key (ADR-0010 §7). */
export const chatDeviceRevoked = defineEvent({
  type: "chat.device_revoked",
  version: 1,
  kind: "audit",
  resourceType: "chat_device",
  payload: z.strictObject({}),
});

/**
 * A conversation was started, and on what grounds: a private one from a
 * friendship or a structured contact (PS-COM-006), or a loan logistics
 * channel's own (WP-44, PS-COM-007).
 */
export const chatConversationStarted = defineEvent({
  type: "chat.conversation_started",
  version: 1,
  kind: "domain",
  resourceType: "chat_conversation",
  payload: z.strictObject({
    openedVia: z.enum([
      "friendship",
      "loan_request",
      "object_question",
      "loan_logistics",
    ]),
  }),
});
