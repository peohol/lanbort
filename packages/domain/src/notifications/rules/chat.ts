import {
  chatAccountKeyReset,
  chatAccountRestored,
  chatDeviceLinked,
} from "../../chat/events";
import type { EventDefinition } from "../../events/catalog";
import { notifyOn, tell } from "../rule";

/**
 * Tells the account a device was added: linked, or restored with the
 * recovery key (PS-COM-016). The event names that device, so only its own
 * account hears of it.
 */
const deviceAdded = <P>(event: EventDefinition<P>) =>
  notifyOn(
    event,
    async ({ db, event: happened }) => {
      const device = await db
        .selectFrom("app.chat_devices")
        .select("user_id")
        .where("id", "=", happened.resourceId)
        .executeTakeFirst();

      return device
        ? tell([device.user_id], "chat.device_linked", {
            type: "chat_device",
            id: happened.resourceId,
          })
        : [];
    },
    { tellsActor: true },
  );

/**
 * Security notices about the account's own private chat. A reset is told to
 * the account even though it acted itself (ADR-0010 §8): whoever has taken
 * over the e-mail account could have made it, and the owner must learn
 * that every device was shut out.
 */
export const chatRules = [
  // Also when the owner approved or restored it themselves.
  deviceAdded(chatDeviceLinked),
  deviceAdded(chatAccountRestored),
  notifyOn(
    chatAccountKeyReset,
    async ({ db, event }) => {
      const device = await db
        .selectFrom("app.chat_devices")
        .select("user_id")
        .where("id", "=", event.resourceId)
        .executeTakeFirst();

      return device
        ? tell([device.user_id], "chat.account_key_reset", {
            type: "chat_device",
            id: event.resourceId,
          })
        : [];
    },
    { tellsActor: true },
  ),
];
