import { isDomainError } from "@lanbort/domain";

export interface CommandOutcome {
  readonly exitCode: 0 | 1 | 2;
  readonly message: string;
}

/** A refusal from the domain as the command's answer; anything else throws. */
export function refusal(error: unknown): CommandOutcome {
  if (isDomainError(error)) {
    const fields = error.fields.length ? ` (${error.fields.join(", ")})` : "";
    return { exitCode: 1, message: `Refused: ${error.code}${fields}.` };
  }

  throw error;
}
