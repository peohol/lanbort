import { EmailSendError, type EmailSender, type OutgoingEmail } from "./sender";

/**
 * Records what would have been sent. Never used by production code. Like the
 * real provider, a repeated idempotency key is accepted without a second
 * message. {@link fail} makes the next sends to one address fail.
 */
export class MemoryEmailSender implements EmailSender {
  /** Every attempt, in order, including repeats and failures. */
  readonly attempts: OutgoingEmail[] = [];
  /** What the recipients got: one message per idempotency key. */
  readonly sent: OutgoingEmail[] = [];
  private readonly failures = new Map<string, EmailSendError[]>();

  fail(address: string, ...errors: EmailSendError[]): void {
    this.failures.set(address, [
      ...(this.failures.get(address) ?? []),
      ...errors,
    ]);
  }

  async send(email: OutgoingEmail) {
    this.attempts.push(email);
    const failure = this.failures.get(email.to)?.shift();

    if (failure) {
      throw failure;
    }

    if (
      !this.sent.some((sent) => sent.idempotencyKey === email.idempotencyKey)
    ) {
      this.sent.push(email);
    }
  }

  to(address: string): OutgoingEmail[] {
    return this.sent.filter((email) => email.to === address);
  }

  attemptsTo(address: string): OutgoingEmail[] {
    return this.attempts.filter((email) => email.to === address);
  }
}

export { EmailSendError };
