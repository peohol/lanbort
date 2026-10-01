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
  --role     Role to change (default: platform_steward)
  --email    Verified e-mail address of a registered account
  --reason   Why the change is made; stored with the grant, never logged
`;

const commands = { grant: grantPlatformRole, revoke: revokePlatformRole };

export interface CommandOutcome {
  readonly exitCode: 0 | 1 | 2;
  readonly message: string;
}

/**
 * The audited operational path for platform roles. It runs as the system
 * process `ops.platform_roles`, through the same command and policy boundary
 * as the app, so every change is validated and recorded as an audit event.
 */
export async function runPlatformRoleCommand(
  domain: DomainContext,
  argv: readonly string[],
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

  try {
    const { output } = await executeCommand(domain, command, {
      actor: systemActor(platformRoleOpsProcess),
      input: parsed.values,
    });

    return {
      exitCode: 0,
      message: `${action === "grant" ? "Granted" : "Revoked"} ${parsed.values.role} (grant ${output.grantId}).`,
    };
  } catch (error) {
    if (isDomainError(error)) {
      const fields = error.fields.length ? ` (${error.fields.join(", ")})` : "";
      return { exitCode: 1, message: `Refused: ${error.code}${fields}.` };
    }

    throw error;
  }
}
