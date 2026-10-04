const REDACTED = "[redacted]";

/**
 * Holds key material so it cannot reach logs, audit events or analytics by
 * accident (ADR-0010). The value lives in a private field: JSON, string
 * conversion, `util.inspect`, `Object.keys` and `structuredClone` all see
 * nothing. Only `reveal()` gives the value back, and only crypto code calls it.
 */
export class Secret<T> {
  readonly #value: T;

  constructor(value: T) {
    this.#value = value;
  }

  reveal(): T {
    return this.#value;
  }

  toJSON(): string {
    return REDACTED;
  }

  toString(): string {
    return REDACTED;
  }

  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return `Secret(${REDACTED})`;
  }
}

/** Overwrites key bytes that are no longer needed. */
export function wipe(...buffers: Uint8Array[]): void {
  for (const buffer of buffers) buffer.fill(0);
}
