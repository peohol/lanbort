import { chatAccountKeyReset, chatDeviceLinked } from "../../chat/events";
import { notifyOn, tell } from "../rule";

/**
 * Security notices about the account's own private chat. A reset is told to
 * the account even though it acted itself (ADR-0010 §8): whoever has taken
 * over the e-mail account could have made it, and the owner must learn
 * that every device was shut out.
 */
export const chatRules = [
  // The account owner is informed when another chat device is approved,
  // including when they personally approved it (PS-COM-016). The event
  // refers to that device, so only its actual account is notified.
  notifyOn(
    chatDeviceLinked,
    async ({ db, event }) => {
      const device = await db
        .selectFrom("app.chat_devices")
        .select("user_id")
        .where("id", "=", event.resourceId)
        .executeTakeFirst();

      return device
        ? tell([device.user_id], "chat.device_linked", {
            type: "chat_device",
            id: event.resourceId,
          })
        : [];
    },
    { tellsActor: true },
  ),
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
