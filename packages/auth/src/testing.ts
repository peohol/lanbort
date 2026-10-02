import type { CookieStore, CookieToSet } from "./index";

/**
 * Test helpers for the local Supabase stack. Never imported by production
 * code.
 */

/** A cookie jar that behaves like a browser between requests. */
export class MemoryCookieStore implements CookieStore {
  readonly cookies = new Map<string, string>();

  getAll() {
    return [...this.cookies].map(([name, value]) => ({ name, value }));
  }

  setAll(toSet: CookieToSet[]) {
    for (const { name, value, options } of toSet) {
      if (value === "" || options.maxAge === 0) {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
}

interface MailpitSummary {
  ID: string;
  Created: string;
}

/**
 * Reads the newest one-time code sent to `email` from the local Mailpit
 * inbox, waiting until a message newer than `since` arrives.
 */
export async function readEmailCode(
  email: string,
  options: { since?: Date; mailpitUrl?: string; timeoutMs?: number } = {},
): Promise<string> {
  const mailpit =
    options.mailpitUrl ?? process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
  const since = options.since?.getTime() ?? 0;
  const deadline = Date.now() + (options.timeoutMs ?? 10_000);

  while (Date.now() < deadline) {
    const search = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages = [] } = (await search.json()) as {
      messages?: MailpitSummary[];
    };
    const latest = messages
      .filter((message) => Date.parse(message.Created) >= since - 1000)
      .sort((a, b) => Date.parse(b.Created) - Date.parse(a.Created))[0];

    if (latest) {
      const message = (await (
        await fetch(`${mailpit}/api/v1/message/${latest.ID}`)
      ).json()) as { Text: string };
      const code = message.Text.match(/\b\d{6,10}\b/)?.[0];

      if (code) {
        return code;
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`No one-time code arrived for ${email}`);
}
