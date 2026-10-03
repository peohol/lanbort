import { describe, expect, it } from "vitest";
import { createResendSender } from "./resend";
import type { OutgoingEmail } from "./sender";

const email: OutgoingEmail = {
  to: "anna@example.com",
  subject: "Et lån er kansellert",
  text: "tekst",
  html: "<p>tekst</p>",
  idempotencyKey: "notification-email/2b0b4e43-6c5f-4d8a-9a43-0b1f3e1d2c11",
};

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return respond();
  }) as unknown as typeof globalThis.fetch;

  return { calls, fetch };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("the Resend sender", () => {
  it("posts the message with the API key and the message's idempotency key", async () => {
    const { calls, fetch } = fakeFetch(() => json(200, { id: "re_1" }));
    const sender = createResendSender({
      apiKey: "re_test_key",
      from: "Lånbort <varsler@example.com>",
      fetch,
    });

    await sender.send(email);

    expect(calls).toHaveLength(1);
    const [{ url, init }] = calls as [{ url: string; init: RequestInit }];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer re_test_key",
      "idempotency-key": email.idempotencyKey,
    });
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Lånbort <varsler@example.com>",
      to: ["anna@example.com"],
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  });

  it.each([
    [429, { name: "rate_limit_exceeded" }, "rate_limited", true],
    [500, { name: "application_error" }, "provider_unavailable", true],
    [503, {}, "provider_unavailable", true],
    [401, { name: "missing_api_key" }, "not_authorized", true],
    [403, { name: "validation_error" }, "not_authorized", true],
    [409, { name: "concurrent_idempotent_requests" }, "send_in_progress", true],
    [
      409,
      { name: "invalid_idempotent_request" },
      "idempotency_conflict",
      false,
    ],
    [422, { name: "missing_required_field" }, "rejected", false],
    [400, { name: "validation_error" }, "rejected", false],
  ])(
    "maps %i %o to %s (retryable: %s)",
    async (status, body, code, retryable) => {
      const { fetch } = fakeFetch(() => json(status, body));
      const sender = createResendSender({ apiKey: "k", from: "f", fetch });

      await expect(sender.send(email)).rejects.toMatchObject({
        name: "EmailSendError",
        code,
        retryable,
      });
    },
  );

  it("treats a network failure as retryable and never repeats the address or the provider's text", async () => {
    const { fetch } = fakeFetch(() => {
      throw new Error("connect ECONNREFUSED for anna@example.com");
    });
    const sender = createResendSender({ apiKey: "k", from: "f", fetch });

    const error = await sender.send(email).catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "provider_unreachable",
      retryable: true,
    });
    expect(String((error as Error).message)).not.toContain("anna");

    const rejected = createResendSender({
      apiKey: "k",
      from: "f",
      fetch: fakeFetch(() =>
        json(422, { name: "x", message: "anna@example.com is invalid" }),
      ).fetch,
    });
    const failure = await rejected
      .send(email)
      .catch((caught: unknown) => caught);
    expect(String((failure as Error).message)).not.toContain("anna");
  });

  it("survives an error response that is not JSON", async () => {
    const { fetch } = fakeFetch(
      () => new Response("bad gateway", { status: 502 }),
    );
    const sender = createResendSender({ apiKey: "k", from: "f", fetch });

    await expect(sender.send(email)).rejects.toMatchObject({
      code: "provider_unavailable",
    });
  });
});
