/**
 * Transactional e-mail for server code (ADR-0008). Callers see a message and
 * an outcome, never the provider's API, URLs or credentials.
 */
export interface OutgoingEmail {
  /** One verified address. Never logged. */
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  /**
   * Stable for every attempt to send this message, so a retry after an
   * uncertain outcome does not send it twice.
   */
  readonly idempotencyKey: string;
}

export interface EmailSender {
  /** Resolves once the provider has accepted the message. */
  send(email: OutgoingEmail): Promise<void>;
}

/**
 * The provider did not accept a message. Carries only a machine code, never
 * the address, the content or the provider's own error text. A retryable
 * failure (rate limit, outage, a configuration that can be fixed) may
 * succeed later; any other one never will for this message.
 */
export class EmailSendError extends Error {
  constructor(
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(`E-mail was not sent: ${code}`);
    this.name = "EmailSendError";
  }
}
