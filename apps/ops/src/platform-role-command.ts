import { randomUUID } from "node:crypto";
import { parseArgs } from "node:util";
import {
  type DomainContext,
  executeCommand,
  grantPlatformRole,
  isDomainError,
  platformRoleOpsProcess,
  revokePlatformRole,
  systemActor,
} from "@lanbort/domain";

export const usage = `Grants or revokes a global product role (PS-USR-008).

  pnpm ops:platform-role grant  --email <address> --reason "<why>"
  pnpm ops:platform-role revoke --email <address> --reason "<why>"

Options:
  --role             Role to change (default: platform_steward)
  --email            Verified e-mail address of a registered account
  --reason           Why the change is made; stored with the grant, never logged
  --idempotency-key  Key from an earlier attempt, to retry the same change
                     safely (default: a new key, printed before the change)
`;

const commands = { grant: grantPlatformRole, revoke: revokePlatformRole };

export interface CommandOutcome {
  readonly exitCode: 0 | 1 | 2;
  readonly message: string;
}

export interface CommandOptions {
  /** Told the key before the change runs, so an interrupted run can be retried. */
  readonly announceKey?: (key: string) => void;
}

/**
 * The audited operational path for platform roles. It runs as the system
 * process `ops.platform_roles`, through the same command and policy boundary
 * as the app, so every change is validated and recorded as an audit event.
 */
export async function runPlatformRoleCommand(
  domain: DomainContext,
  argv: readonly string[],
  { announceKey }: CommandOptions = {},
): Promise<CommandOutcome> {
  let parsed;

  try {
    parsed = parseArgs({
      args: [...argv],
      allowPositionals: true,
      options: {
        role: { type: "string", default: "platform_steward" },
        email: { type: "string" },
        reason: { type: "string" },
        "idempotency-key": { type: "string" },
      },
    });
  } catch {
    return { exitCode: 2, message: usage };
  }

  const [action, ...rest] = parsed.positionals;
  const command = commands[action as keyof typeof commands];

  if (!command || rest.length > 0) {
    return { exitCode: 2, message: usage };
  }

  const { "idempotency-key": givenKey, ...input } = parsed.values;
  const idempotencyKey = givenKey ?? randomUUID();
  announceKey?.(idempotencyKey);

  try {
    // The key identifies this one logical change: a retry with it returns the
    // first result instead of changing the role again (docs/architecture/05).
    const { output, replayed } = await executeCommand(domain, command, {
      actor: systemActor(platformRoleOpsProcess),
      input,
      idempotencyKey,
    });

    return {
      exitCode: 0,
      message: `${action === "grant" ? "Granted" : "Revoked"} ${input.role} (grant ${output.grantId})${replayed ? ", already applied with this key" : ""}.`,
    };
  } catch (error) {
    if (isDomainError(error)) {
      const fields = error.fields.length ? ` (${error.fields.join(", ")})` : "";
      return { exitCode: 1, message: `Refused: ${error.code}${fields}.` };
    }

    throw error;
  }
}
