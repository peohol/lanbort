import { newAccountsAreOpen } from "./new-accounts";

/**
 * Whether private chat is on in this environment; off unless set
 * (`CHAT_ENABLED`, ADR-0010 §2):
 *
 * - `true`: on, for local development and CI.
 * - `pilot`: on only while Lånbort is a closed pilot, so only invited
 *   participants can reach it (PS-NFR-015). It turns itself off when the
 *   auth provider starts making accounts for new addresses, or cannot say.
 *
 * Anything else, or nothing, is off. Removing it and deploying again is how
 * chat is turned off in a security incident (docs/implementation/
 * pilot-operations.md).
 */
export async function chatEnabled(): Promise<boolean> {
  switch (process.env.CHAT_ENABLED) {
    case "true":
      return true;
    case "pilot":
      return !(await newAccountsAreOpen());
    default:
      return false;
  }
}
