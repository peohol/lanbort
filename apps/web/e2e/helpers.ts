import {
  generateKeyPairSync,
  randomBytes,
  randomUUID,
  sign,
} from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { readEmailCode } from "@lanbort/auth/testing";
import { chatSignatureLabel, deviceCertificateBody } from "@lanbort/contracts";
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  type Page,
} from "@playwright/test";

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
  await enterEmailCode(page, email);
}

/** The sign-in form's two steps, on a page that shows it. */
export async function enterEmailCode(page: Page, email: string) {
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

/** Makes the owner's object visible to their friends (PS-OBJ-020). */
export async function showToFriends(
  owner: APIRequestContext,
  objectId: string,
) {
  await postCommand(owner, `/api/objects/${objectId}/friends`);
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

/**
 * A loan agreed between two signed-in accounts, starting today: the lender
 * registers the object, the borrower asks, and the lender approves.
 */
export async function agreeLoan(
  lender: APIRequestContext,
  borrower: APIRequestContext,
  title: string,
): Promise<string> {
  const json = async (response: Promise<APIResponse>) =>
    (await response).json();
  const { objectId } = await json(
    postCommand(lender, "/api/objects", {
      title,
      categoryId: "annet",
      description: `${title} til utlån.`,
      availability: [{ start: today(), end: null }],
    }),
  );
  await showToFriends(lender, objectId);
  const preview = await json(
    borrower.get(`/api/loan-requests/preview?objectId=${objectId}`),
  );
  const { requestId } = await json(
    postCommand(borrower, "/api/loan-requests", {
      objectId,
      origin: { kind: "direct" },
      start: { kind: "date", date: today() },
      end: { kind: "duration", days: 2 },
      message: "Kan jeg låne den?",
      termsVersion: preview.termsVersion,
      responsibilityDeclarationVersion:
        preview.responsibilityDeclarationVersion,
    }),
  );
  await postCommand(lender, `/api/loan-requests/${requestId}/responsibility`, {
    declarationVersion: preview.responsibilityDeclarationVersion,
  });
  const { loanId } = await json(
    postCommand(lender, `/api/loan-requests/${requestId}/approve`),
  );
  return loanId;
}

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

/**
 * WCAG 2.2 level A and AA as the automated bar. The legal target is set
 * before public launch (PS-NFR-010, Port E); this is the floor until then.
 */
const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * The WCAG rules that fail, by rule and element, for a readable diff. The
 * sticky header and navigation cover a different strip of the page at every
 * scroll position, so for this they lie in the flow; that they never cover
 * what has focus is what `keyboardProblems` checks.
 */
export async function axeViolations(page: Page) {
  const unstuck = await page.addStyleTag({
    content: ".app-header, .main-navigation { position: static !important }",
  });
  const { violations } = await new AxeBuilder({ page })
    .withTags(wcagTags)
    .analyze();
  await unstuck.evaluate((style) => (style as Element).remove());

  return violations.flatMap(({ id, nodes }) =>
    nodes.map(({ target }) => `${id}: ${target.join(" ")}`),
  );
}
