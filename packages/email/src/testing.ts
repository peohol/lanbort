import { EmailSendError, type EmailSender, type OutgoingEmail } from "./sender";

/**
 * Records what would have been sent. Never used by production code. Like the
 * real provider, a repeated idempotency key is accepted without a second
 * message. {@link fail} makes the next sends to one address fail, and
 * {@link hold} stops them part-way until released.
 */
export class MemoryEmailSender implements EmailSender {
  /** Every attempt, in order, including repeats and failures. */
  readonly attempts: OutgoingEmail[] = [];
  /** What the recipients got: one message per idempotency key. */
  readonly sent: OutgoingEmail[] = [];
  private readonly failures = new Map<string, EmailSendError[]>();
  private readonly holds = new Map<
    string,
    { reach: () => void; released: Promise<void> }
  >();

  fail(address: string, ...errors: EmailSendError[]): void {
    this.failures.set(address, [
      ...(this.failures.get(address) ?? []),
      ...errors,
    ]);
  }

  /**
   * Holds every send to `address` as if the provider were still answering.
   * `reached` resolves once one is held; `release` lets them all finish.
   */
  hold(address: string): { reached: Promise<void>; release: () => void } {
    let reach!: () => void;
    let release!: () => void;
    const reached = new Promise<void>((resolve) => (reach = resolve));
    const released = new Promise<void>((resolve) => (release = resolve));
    this.holds.set(address, { reach, released });

    return {
      reached,
      release: () => {
        this.holds.delete(address);
        release();
      },
    };
  }

  async send(email: OutgoingEmail) {
    const held = this.holds.get(email.to);

    if (held) {
      held.reach();
      await held.released;
    }

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
