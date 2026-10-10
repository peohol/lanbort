import { passkeyRoute } from "@/server/http/passkey-route";

/** Verifies and records the new passkey (OD-0023). */
export const POST = passkeyRoute("finishRegistration");
