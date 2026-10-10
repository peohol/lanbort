import { passkeyRoute } from "@/server/http/passkey-route";

/** Starts confirming this session with a passkey (ADR-0011). */
export const POST = passkeyRoute("beginConfirmation");
