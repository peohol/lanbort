import { writeLog } from "@lanbort/observability";
import { sql } from "kysely";
import { type Actor, userScope } from "../actor";
import type { DomainContext } from "../commands/command";
import { DomainError } from "../errors";

/**
 * A budget of `limit` uses per `windowSeconds` for one subject, with a burst
 * of at most `limit` (WP-73). Rules that share a name share the budget.
 */
export interface RateLimit {
  readonly rule: string;
  readonly limit: number;
  readonly windowSeconds: number;
}

const minutes = 60;
const hours = 60 * minutes;

function rule(name: string, limit: number, windowSeconds: number): RateLimit {
  return Object.freeze({ rule: name, limit, windowSeconds });
}

/**
 * Every rate limit, in one place (WP-73, threat model «Spam, trakassering og
 * scraping» and «Konto-overtakelse»). Each is far above what one person does
 * by hand and stops automation: the limits guard volume, never decide about
 * a person, and a refused use changes nothing (PS-NFR-012).
 */
export const rateLimits = {
  /** New contact with others: friend and loan requests, questions, contact and joining. */
  contact: rule("contact", 60, hours),
  /** Invitations to environments, roles and co-ownership. */
  invitations: rule("invitations", 60, hours),
  /**
   * Writing in cases, where a participant may submit copies of private
   * messages with what they write (WP-46).
   */
  caseEntries: rule("case_entries", 60, hours),
  /** Reports to administrators and platform stewards. */
  reports: rule("reports", 20, hours),
  /** Finding and looking up others: search, profiles, environments, relations. */
  lookups: rule("lookups", 150, 5 * minutes),
  /** Private messages and commits from a chat device (ADR-0010 §9). */
  chatMessages: rule("chat_messages", 600, hours),
  /** Chat devices, links and key packages: setting up and adding devices. */
  chatKeys: rule("chat_keys", 120, hours),
  /** Replacing the account key, which shuts out every device (ADR-0010 §8). */
  chatResets: rule("chat_resets", 3, 24 * hours),
  /** History archives moved to a new device, part by part (ADR-0010 §5). */
  chatArchives: rule("chat_archives", 200, hours),
  /** Place names from the external place search. */
  placeSearch: rule("place_search", 30, 5 * minutes),
  /** E-mail codes sent to one address, for sign-in and re-authentication. */
  emailCodesPerAddress: rule("email_codes_per_address", 5, hours),
  /** E-mail codes requested from one client network address. */
  emailCodesPerClient: rule("email_codes_per_client", 60, hours),
  /** Attempts to enter a code for one e-mail address. */
  codeAttemptsPerAddress: rule("code_attempts_per_address", 10, 15 * minutes),
  /** Attempts to enter a code from one client network address. */
  codeAttemptsPerClient: rule("code_attempts_per_client", 120, 15 * minutes),
} as const satisfies Record<string, RateLimit>;

/**
 * A use the subject's budget does not allow now. Nothing was done; the use
 * may be tried again after `retryAfterSeconds`.
 */
export class RateLimitedError extends DomainError {
  constructor(
    readonly rule: string,
    readonly retryAfterSeconds: number,
  ) {
    super("rate_limited", `Rate limit ${rule} reached`);
    this.name = "RateLimitedError";
  }
}

/**
 * Uses one unit of `limit` for `subject`, or throws `RateLimitedError`. The
 * count is kept in the database in its own short transaction before the
 * guarded operation, so refused, failed and not-found attempts count too.
 * The subject is only stored as a keyed hash.
 */
export async function consumeRateLimit(
  domain: Pick<DomainContext, "db" | "clock">,
  limit: RateLimit,
  subject: string,
): Promise<void> {
  const now = domain.clock?.() ?? new Date();
  const { rows } = await sql<{ wait: number | null }>`
    select extract(epoch from app.consume_rate_limit(
      ${limit.rule}, ${subject}, ${limit.limit}::integer,
      make_interval(secs => ${limit.windowSeconds}), ${now}
    ))::float8 as wait
  `.execute(domain.db);
  const wait = rows[0]?.wait ?? null;

  if (wait !== null) {
    writeLog("warn", "security.rate_limited", { rateLimit: limit.rule });
    throw new RateLimitedError(limit.rule, Math.max(1, Math.ceil(wait)));
  }
}

/** A signed-in user's use of a limited operation; others are not limited here. */
export async function consumeActorRateLimit(
  domain: Pick<DomainContext, "db" | "clock">,
  limit: RateLimit | undefined,
  actor: Actor,
): Promise<void> {
  if (limit && actor.kind === "user") {
    await consumeRateLimit(domain, limit, userScope(actor.userId));
  }
}
