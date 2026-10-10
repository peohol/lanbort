import { parseArgs } from "node:util";
import {
  type DomainContext,
  executeCommand,
  issueStewardEnrollmentCode,
  resetStewardPasskeys,
  stewardPasskeyOpsProcess,
  systemActor,
} from "@lanbort/domain";
import { type CommandOutcome, refusal } from "./outcome";

export const usage = `Lets a platform steward add passkeys (ADR-0011, OD-0023).

  pnpm ops:steward-passkeys enroll --email <address> --reason "<why>"
  pnpm ops:steward-passkeys reset  --email <address> --reason "<why>"

enroll  Issues a one-time enrollment code for the steward's first passkey.
reset   For a steward who has lost every passkey: removes them all, then
        issues a new code.

The code is printed once and only its hash is kept. Hand it over in person
or by phone, never by e-mail; it works for one passkey, for that account,
within the hour. A new code voids any earlier one, so a run can simply be
repeated. The steward is told by e-mail, and every step is audited.

Options:
  --email   Verified e-mail address of an account with the platform_steward role
  --reason  Why the code is issued; stored with the code, never logged
`;

const commands = {
  enroll: issueStewardEnrollmentCode,
  reset: resetStewardPasskeys,
};

/**
 * The audited operational path for stewards' enrollment codes. It runs as
 * the system process `ops.steward_passkeys`, through the same command and
 * policy boundary as the app.
 */
export async function runStewardPasskeysCommand(
  domain: DomainContext,
  argv: readonly string[],
): Promise<CommandOutcome> {
  let parsed;

  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: { email: { type: "string" }, reason: { type: "string" } },
    });
  } catch {
    return { exitCode: 2, message: usage };
  }

  const [action, ...rest] = parsed.positionals;
  const command = commands[action as keyof typeof commands];

  if (!command || rest.length > 0) {
    return { exitCode: 2, message: usage };
  }

  try {
    const { output } = await executeCommand(domain, command, {
      actor: systemActor(stewardPasskeyOpsProcess),
      input: parsed.values,
    });
    const removed =
      action === "reset" ? `Removed ${output.removedPasskeys} passkeys. ` : "";

    return {
      exitCode: 0,
      message: `${removed}Enrollment code: ${output.code} (valid until ${output.expiresAt}, once).`,
    };
  } catch (error) {
    return refusal(error);
  }
}
