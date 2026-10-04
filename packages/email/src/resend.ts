import { EmailSendError, type EmailSender } from "./sender";

export interface ResendSenderConfig {
  /** Server-only API key from the platform's secret store. */
  readonly apiKey: string;
  /** Sender identity on a verified domain, e.g. `Lånbort <varsler@…>`. */
  readonly from: string;
  /** For tests; the global fetch otherwise. */
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

const endpoint = "https://api.resend.com/emails";

/** What a failed response means for this message (Resend API errors). */
function failureOf(status: number, name: unknown): EmailSendError {
  if (status === 409) {
    // The same key is still being sent by an earlier attempt; any other
    // conflict means the key was used for a different message.
    return name === "concurrent_idempotent_requests"
      ? new EmailSendError("send_in_progress", true)
      : new EmailSendError("idempotency_conflict", false);
  }

  if (status === 429) {
    return new EmailSendError("rate_limited", true);
  }

  if (status >= 500) {
    return new EmailSendError("provider_unavailable", true);
  }

  // A missing, restricted or suspended key, or an unverified sender domain,
  // is fixed in configuration, after which the message can still go out.
  if (status === 401 || status === 403) {
    return new EmailSendError("not_authorized", true);
  }

  return new EmailSendError("rejected", false);
}

async function errorName(response: Response): Promise<unknown> {
  try {
    return ((await response.json()) as { name?: unknown }).name;
  } catch {
    return undefined;
  }
}

/**
 * Sends through the Resend API, Lånbort's first e-mail provider (ADR-0008).
 * The idempotency key makes Resend drop a repeated request with the same key
 * for 24 hours, so a retry after a lost response does not send twice.
 */
export function createResendSender(config: ResendSenderConfig): EmailSender {
  const send = config.fetch ?? fetch;
  const timeoutMs = config.timeoutMs ?? 10_000;

  return {
    async send(email) {
      let response: Response;

      try {
        response = await send(endpoint, {
          method: "POST",
          headers: {
            authorization: `Bearer ${config.apiKey}`,
            "content-type": "application/json",
            "idempotency-key": email.idempotencyKey,
          },
          body: JSON.stringify({
            from: config.from,
            to: [email.to],
            subject: email.subject,
            text: email.text,
            html: email.html,
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch {
        throw new EmailSendError("provider_unreachable", true);
      }

      if (!response.ok) {
        throw failureOf(response.status, await errorName(response));
      }
    },
  };
}
