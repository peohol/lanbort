import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { type APIResponse, expect, test } from "@playwright/test";
import { accountId, postCommand, registerThroughApi, today } from "./helpers";

/**
 * WP-70 over HTTP: a stranger asks every read route of the API about what
 * lives in a hidden environment, and again about ids that name nothing. The
 * answers must be the same down to status, headers and body, so the API
 * itself tells nobody the environment, its objects, loans or cases exist
 * (PS-NFR-002). The domain suite (`security/pilot-access`) does the same for
 * every command and query; this checks what reaches the client.
 */

const apiRoot = fileURLToPath(new URL("../src/app/api", import.meta.url));

/** Every API route that answers GET, as its path with `[segments]`. */
function readRoutes(directory = apiRoot): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) return readRoutes(path);

    return entry.name === "route.ts" &&
      /export const GET\b/.test(readFileSync(path, "utf8"))
      ? [relative(apiRoot, directory).split(sep).join("/")]
      : [];
  });
}

interface Ids {
  environmentId: string;
  objectId: string;
  imageId: string;
  requestId: string;
  loanId: string;
  caseId: string;
  questionId: string;
}

/** The query each read route that names a resource gets, from the ids. */
const probes: Record<string, (ids: Ids) => Record<string, string>> = {
  "cases/[caseId]": () => ({}),
  "cases/[caseId]/measures": () => ({}),
  "cases/queue/environment": (ids) => ({ environmentId: ids.environmentId }),
  "environments/details": (ids) => ({ environmentId: ids.environmentId }),
  "environments/memberships": (ids) => ({ environmentId: ids.environmentId }),
  "environments/roles": (ids) => ({ environmentId: ids.environmentId }),
  "environments/publications": (ids) => ({ environmentId: ids.environmentId }),
  "environments/objects": (ids) => ({ environmentId: ids.environmentId }),
  "environments/objects/image": (ids) => ({
    environmentId: ids.environmentId,
    objectId: ids.objectId,
    imageId: ids.imageId,
  }),
  "loan-requests/[requestId]": () => ({}),
  "loan-requests/preview": (ids) => ({
    objectId: ids.objectId,
    environmentId: ids.environmentId,
  }),
  "loans/[loanId]": () => ({}),
  "loans/[loanId]/history": () => ({}),
  "loans/[loanId]/reviews": () => ({}),
  "object-questions": (ids) => ({
    environmentId: ids.environmentId,
    objectId: ids.objectId,
  }),
  "object-questions/thread": (ids) => ({ questionId: ids.questionId }),
  "objects/[objectId]": () => ({}),
  "objects/[objectId]/history": () => ({}),
  "objects/[objectId]/images/[imageId]": () => ({}),
  "objects/[objectId]/publications": () => ({}),
  "search/objects": (ids) => ({
    environmentId: ids.environmentId,
    categoryId: "annet",
  }),
};

/** Read routes over the caller's own things, or not for users at all. */
const namesNoResource = new Set([
  "account",
  "account/deletion",
  "cases",
  "cases/queue/platform",
  "environments",
  "health",
  "home",
  "loan-requests",
  "loans",
  "loans/co-owner",
  "notifications",
  "notifications/preferences",
  "notifications/unread",
  "object-categories",
  "objects",
  "object-invitations",
  "object-subscriptions",
  "search/environments",
  "social",
  "social/relation",
  "trust",
]);

test("every read route that names a resource is probed", () => {
  const unprobed = readRoutes().filter(
    (route) =>
      !route.startsWith("internal/") &&
      !(route in probes) &&
      !namesNoResource.has(route),
  );
  expect(unprobed).toEqual([]);
});

/** The response as the client gets it, with what was sent in left out. */
async function seen(response: APIResponse, sent: readonly string[]) {
  const headers = response.headers();
  const body = sent.reduce(
    (text, value) => text.replaceAll(value, "<sent>"),
    await response.text(),
  );

  return {
    status: response.status(),
    contentType: headers["content-type"],
    cacheControl: headers["cache-control"],
    body,
  };
}

test("a hidden environment answers a stranger as if nothing in it existed", async ({
  request,
  playwright,
  baseURL,
}) => {
  const person = async () => {
    const context = await playwright.request.newContext({
      baseURL: baseURL!,
      extraHTTPHeaders: { origin: baseURL! },
    });
    await registerThroughApi(context);
    return { context, userId: await accountId(context) };
  };

  // An administrator, a lender, a borrower and a member of a hidden
  // environment, with a loan through it, a question and a case.
  await registerThroughApi(request);
  const { environmentId } = await (
    await postCommand(request, "/api/environments", {
      name: `Skjult ${randomUUID().slice(0, 8)}`,
      type: "hidden",
    })
  ).json();
  const [lender, borrower, member] = [
    await person(),
    await person(),
    await person(),
  ];
  for (const { context, userId } of [lender, borrower, member]) {
    await postCommand(request, "/api/environments/memberships/invite", {
      environmentId,
      userId,
    });
    await postCommand(context, "/api/environments/membership/accept", {
      environmentId,
      answers: [],
    });
  }

  const { objectId } = await (
    await postCommand(lender.context, "/api/objects", {
      title: "Tilhenger",
      categoryId: "annet",
      description: "Liten tilhenger med presenning.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await postCommand(lender.context, `/api/objects/${objectId}/publications`, {
    environmentId,
  });
  const { termsVersion } = await (
    await borrower.context.get(
      `/api/loan-requests/preview?objectId=${objectId}&environmentId=${environmentId}`,
    )
  ).json();
  const { requestId } = await (
    await postCommand(borrower.context, "/api/loan-requests", {
      objectId,
      origin: { kind: "environment", environmentId },
      start: { kind: "asap" },
      end: { kind: "duration", days: 2 },
      message: "Kan jeg låne den?",
      termsVersion,
    })
  ).json();
  const { loanId } = await (
    await postCommand(lender.context, `/api/loan-requests/${requestId}/approve`)
  ).json();
  const { questionId } = await (
    await postCommand(member.context, "/api/object-questions", {
      environmentId,
      objectId,
      body: "Passer den til en liten bil?",
    })
  ).json();
  const { caseId } = await (
    await postCommand(member.context, "/api/environments/contact", {
      environmentId,
      body: "Hei, kan dere se på reglene?",
    })
  ).json();

  const real: Ids = {
    environmentId,
    objectId,
    imageId: randomUUID(),
    requestId,
    loanId,
    caseId,
    questionId,
  };
  const nowhere = Object.fromEntries(
    Object.keys(real).map((key) => [key, randomUUID()]),
  ) as unknown as Ids;

  const stranger = await person();
  const ask = (route: string, ids: Ids) => {
    const path = route.replace(
      /\[(\w+)\]/g,
      (_, segment: keyof Ids) => ids[segment],
    );
    const query = new URLSearchParams(probes[route]!(ids));
    const sent = [...Object.values(ids)];

    return stranger.context
      .get(`/api/${path}?${query}`)
      .then((response) => seen(response, sent));
  };

  for (const route of Object.keys(probes)) {
    const answer = await ask(route, real);
    expect(answer.status, route).not.toBe(400);
    expect(answer, route).toEqual(await ask(route, nowhere));
  }
});
