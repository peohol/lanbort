import { passkeyRoute } from "@/server/http/passkey-route";

/** Verifies the passkey's answer and confirms the session (ADR-0011). */
export const POST = passkeyRoute("finishConfirmation");
