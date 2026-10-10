import { passkeyRoute } from "@/server/http/passkey-route";

/**
 * Starts adding a passkey: with the enrollment code for the first, or from a
 * session confirmed with another passkey (OD-0023).
 */
export const POST = passkeyRoute("beginRegistration");
