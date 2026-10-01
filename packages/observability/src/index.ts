export type LogLevel = "info" | "warn" | "error";

type FieldSanitizer<T> = (value: unknown) => T | undefined;

const identifierPattern = /^[A-Za-z0-9_.:-]{1,128}$/;
const httpMethodPattern = /^[A-Z]{3,10}$/;
const routePattern = /^\/[A-Za-z0-9/_.\-[\]]{0,255}$/;
const eventPattern = /^[a-z0-9][a-z0-9_.-]{0,127}$/;

const matching =
  (pattern: RegExp): FieldSanitizer<string> =>
  (value) =>
    typeof value === "string" && pattern.test(value) ? value : undefined;

const integerBetween =
  (min: number, max: number): FieldSanitizer<number> =>
  (value) =>
    typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
      ? value
      : undefined;

const nonNegativeNumber: FieldSanitizer<number> = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

// Query strings and fragments can carry tokens or personal data, so only the
// path part of a route is ever logged.
const routePath: FieldSanitizer<string> = (value) =>
  typeof value === "string"
    ? matching(routePattern)(value.split(/[?#]/, 1)[0])
    : undefined;

/**
 * The only fields a log record may contain. Anything else is dropped at
 * runtime, and values that do not fit their expected shape are dropped too,
 * so free-form or user-supplied content cannot reach the logs by accident.
 */
const fieldSanitizers = {
  requestId: matching(identifierPattern),
  route: routePath,
  method: matching(httpMethodPattern),
  statusCode: integerBetween(100, 599),
  durationMs: nonNegativeNumber,
  job: matching(identifierPattern),
  attempt: integerBetween(0, Number.MAX_SAFE_INTEGER),
  count: integerBetween(0, Number.MAX_SAFE_INTEGER),
} satisfies Record<string, FieldSanitizer<unknown>>;

type FieldName = keyof typeof fieldSanitizers;

export type SafeLogFields = {
  [K in FieldName]?: NonNullable<ReturnType<(typeof fieldSanitizers)[K]>>;
};

function sanitizeFields(fields: SafeLogFields): Partial<SafeLogFields> {
  const safe: Record<string, unknown> = {};

  for (const name of Object.keys(fieldSanitizers) as FieldName[]) {
    const value = fieldSanitizers[name](fields[name]);

    if (value !== undefined) {
      safe[name] = value;
    }
  }

  return safe;
}

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
    ...sanitizeFields(fields),
  });
}

export function writeLog(
  level: LogLevel,
  event: string,
  fields: SafeLogFields = {},
): void {
  process.stdout.write(`${serializeLog(level, event, fields)}\n`);
}
