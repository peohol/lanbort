import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import { readEmailCode } from "@lanbort/auth/testing";
import { chatSignatureLabel, deviceCertificateBody } from "@lanbort/contracts";
import { type APIRequestContext, expect, type Page } from "@playwright/test";

/** Shared steps for the browser tests, against the local Supabase stack. */
export const newEmail = () => `e2e-${randomUUID()}@example.test`;

export function collectBrowserProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      new URL(message.location().url || "http://x/").pathname !== "/favicon.ico"
    ) {
      problems.push(message.text());
    }
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

export async function signInThroughUi(page: Page, email: string) {
  await page.goto("/logg-inn");
  await page.getByLabel("E-postadresse").fill(email);
  const since = new Date();
  await page.getByRole("button", { name: "Send kode" }).click();
  await expect(page.getByRole("status")).toContainText(email);
  await page
    .getByLabel("Kode fra e-posten")
    .fill(await readEmailCode(email, { since }));
  await page.getByRole("button", { name: "Bekreft" }).click();
}

/** Signs in through the API, leaving the session cookies in `request`. */
export async function signInThroughApi(
  request: APIRequestContext,
  email: string,
) {
  const since = new Date();
  expect(
    (await request.post("/api/auth/email-code", { data: { email } })).status(),
  ).toBe(202);
  const verify = await request.post("/api/auth/email-code/verify", {
    data: { email, code: await readEmailCode(email, { since }) },
  });
  expect(verify.status()).toBe(200);
  return verify.json();
}

/** A signed-in, fully registered account; cookies stay in `request`. */
export async function registerThroughApi(
  request: APIRequestContext,
  email = newEmail(),
  realName = "Test Testesen",
) {
  await signInThroughApi(request, email);
  const registration = await request.post("/api/account/registration", {
    data: { realName, adultConfirmed: true },
    headers: { "Idempotency-Key": randomUUID() },
  });
  expect(registration.status()).toBe(200);
  return email;
}

/** A command over the API, with its own idempotency key; it must succeed. */
export async function postCommand(
  request: APIRequestContext,
  path: string,
  data?: object,
) {
  const response = await request.post(path, {
    data,
    headers: { "Idempotency-Key": randomUUID() },
  });
  expect(response.ok(), await response.text()).toBe(true);
  return response;
}

export async function accountId(request: APIRequestContext): Promise<string> {
  return (await (await request.get("/api/account")).json()).userId;
}

/** Today's date in Norway, as the API takes dates. */
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Oslo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

/** A word no other test uses, so the shared database cannot interfere. */
export const uniqueWord = () =>
  Array.from(randomBytes(12), (byte) =>
    String.fromCharCode(97 + (byte % 26)),
  ).join("");

/** Runs the outbox job until `settled` says what it waits for is there. */
export async function untilOutboxSettles(
  request: APIRequestContext,
  settled: () => Promise<boolean>,
) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await request.get("/api/internal/outbox", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });

    if (await settled()) return;
  }

  throw new Error("The outbox never caught up");
}

/** A blank map tile, so a test never depends on the map provider. */
export const blankMapTile = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
  "base64",
);

const ed25519Key = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey
      .export({ format: "der", type: "spki" })
      .subarray(12)
      .toString("base64"),
    privateKey,
  };
};

/**
 * A chat account key and one device it certified, as a client makes them
 * (ADR-0010 §3), for registering chat over the API.
 */
export function chatAccount(userId: string) {
  const account = ed25519Key();
  const certify = (deviceId = randomUUID()) => {
    const body = {
      accountId: userId,
      deviceId,
      deviceKey: ed25519Key().publicKey,
      accountKey: account.publicKey,
    };
    const signature = sign(
      null,
      Buffer.from(
        chatSignatureLabel("device-certificate") + deviceCertificateBody(body),
      ),
      account.privateKey,
    ).toString("base64");
    return { v: 1 as const, ...body, signature };
  };

  return { accountKey: account.publicKey, certify };
}
