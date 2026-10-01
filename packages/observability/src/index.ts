export type LogLevel = "info" | "warn" | "error";

export interface SafeLogFields {
  requestId?: string;
  route?: string;
  method?: string;
  statusCode?: number;
  durationMs?: number;
  job?: string;
  attempt?: number;
}

const eventPattern = /^[a-z0-9][a-z0-9_.-]*$/;

export function serializeLog(
  level: LogLevel,
  event: string,
  fields: SafeLogFields = {},
): string {
  if (!eventPattern.test(event)) {
    throw new Error(
      "Log event names must be static machine identifiers, not user content.",
    );
  }

  return JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });
}

export function writeLog(
  level: LogLevel,
  event: string,
  fields: SafeLogFields = {},
): void {
  process.stdout.write(`${serializeLog(level, event, fields)}\n`);
}
