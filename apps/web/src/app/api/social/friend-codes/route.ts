import { createFriendCode } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** A new friend code for the user to show as a QR code (PS-USR-014). */
export const POST = userCommandRoute(createFriendCode);
