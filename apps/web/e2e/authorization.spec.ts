import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  type APIRequestContext,
  type APIResponse,
  expect,
  test,
} from "@playwright/test";
import sharp from "sharp";
import {
  accountId,
  chatAccount,
  postCommand,
  registerThroughApi,
  showToFriends,
  signInThroughApi,
  today,
} from "./helpers";

/**
 * WP-70 over HTTP: a stranger asks every read route of the API about what
 * lives in a hidden environment, and again about ids that name nothing. The
 * answers must be the same down to status, headers and body, so the API
 * itself tells nobody the environment, its objects, loans or cases exist
 * (PS-NFR-002). Accounts are not hidden, so the routes about a person are
 * asked about one of its members and about someone who has just signed up.
 * The domain suite (`security/pilot-access`) does the same for every
 * command and query; this checks what reaches the client.
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
  conversationId: string;
  linkRequestId: string;
  pictureId: string;
  invitationId: string;
  userId: string;
}

/** The query each read route that names a resource gets, from the ids. */
const probes: Record<string, (ids: Ids) => Record<string, string>> = {
  "cases/[caseId]": () => ({}),
  "cases/[caseId]/images/[imageId]": () => ({}),
  "cases/[caseId]/measures": () => ({}),
  "cases/queue/environment": (ids) => ({ environmentId: ids.environmentId }),
  "chat/conversations/[conversationId]": () => ({}),
  "chat/conversations/[conversationId]/directory": () => ({}),
  "chat/links/[linkRequestId]": () => ({}),
  "environments/details": (ids) => ({ environmentId: ids.environmentId }),
  "environments/memberships": (ids) => ({ environmentId: ids.environmentId }),
  "environments/members": (ids) => ({ environmentId: ids.environmentId }),
  "environments/roles": (ids) => ({ environmentId: ids.environmentId }),
  "environments/publications": (ids) => ({ environmentId: ids.environmentId }),
  "environments/objects": (ids) => ({ environmentId: ids.environmentId }),
  "environments/objects/image": (ids) => ({
    environmentId: ids.environmentId,
    objectId: ids.objectId,
    imageId: ids.imageId,
  }),
  "loan-requests/[requestId]": () => ({}),
  "loan-requests/[requestId]/images/[imageId]": () => ({}),
  "loan-requests/preview": (ids) => ({
    objectId: ids.objectId,
    environmentId: ids.environmentId,
  }),
  "loans/[loanId]": () => ({}),
  "loans/[loanId]/co-owner-view": () => ({}),
  "loans/[loanId]/condition": () => ({}),
  "loans/[loanId]/history": () => ({}),
  "loans/[loanId]/images/[imageId]": () => ({}),
  "loans/[loanId]/logistics": () => ({}),
  "loans/[loanId]/reviews": () => ({}),
  "object-questions": (ids) => ({
    environmentId: ids.environmentId,
    objectId: ids.objectId,
  }),
  "object-questions/thread": (ids) => ({ questionId: ids.questionId }),
  "object-invitations/[invitationId]/images/[imageId]": () => ({}),
  "objects/[objectId]": () => ({}),
  "objects/[objectId]/history": () => ({}),
  "objects/[objectId]/images/[imageId]": () => ({}),
  "objects/[objectId]/publications": () => ({}),
  people: (ids) => ({ userId: ids.userId }),
  "people/pictures/[pictureId]": () => ({}),
  "search/objects": (ids) => ({
    environmentId: ids.environmentId,
    categoryId: "annet",
  }),
  "social/objects": (ids) => ({ userId: ids.userId }),
  "social/objects/image": (ids) => ({
    objectId: ids.objectId,
    imageId: ids.imageId,
  }),
  "social/relation": (ids) => ({ userId: ids.userId }),
  trust: (ids) => ({ userId: ids.userId }),
};

/** Read routes over the caller's own things, or not for users at all. */
const namesNoResource = new Set([
  "account",
  "account/deletion",
  "cases",
  "cases/queue/platform",
  "chat/conversations",
  "chat/devices",
  "chat/inbox",
  "chat/links",
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
  "places",
  "search/environments",
  "social",
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

/** Uploads a small photo to `path` and returns what the API answers. */
async function uploadImage(context: APIRequestContext, path: string) {
  const upload = await context.post(path, {
    data: await sharp({
      create: { width: 40, height: 30, channels: 3, background: "#4a7" },
    })
      .jpeg()
      .toBuffer(),
    headers: { "content-type": "image/jpeg", "Idempotency-Key": randomUUID() },
  });
  expect(upload.ok(), await upload.text()).toBe(true);
  return upload.json();
}

test("a hidden environment answers a stranger as if nothing in it existed", async ({
  request,
  playwright,
  baseURL,
}) => {
  const newContext = () =>
    playwright.request.newContext({
      baseURL: baseURL!,
      extraHTTPHeaders: { origin: baseURL! },
    });
  const person = async () => {
    const context = await newContext();
    const email = await registerThroughApi(context);
    return { context, email, userId: await accountId(context) };
  };

  // An administrator, a lender, a borrower and a member of a hidden
  // environment, with a loan through it, a question, a case and an
  // invitation to co-own the thing.
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
  // Also visible to the lender's friends, which the stranger is not.
  await showToFriends(lender.context, objectId);
  const { imageId } = await uploadImage(
    lender.context,
    `/api/objects/${objectId}/images`,
  );
  const { pictureId } = await uploadImage(
    lender.context,
    "/api/account/picture",
  );
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
  const { invitationId } = await (
    await postCommand(
      lender.context,
      `/api/objects/${objectId}/co-owners/invitations`,
      { userId: member.userId },
    )
  ).json();
  const { caseId } = await (
    await postCommand(member.context, "/api/environments/contact", {
      environmentId,
      body: "Hei, kan dere se på reglene?",
    })
  ).json();

  // The lender's chat with the borrower, and a device of the lender's that
  // waits to be linked from a second sign-in.
  const chat = chatAccount(lender.userId);
  await postCommand(lender.context, "/api/chat/account", {
    accountKey: chat.accountKey,
    certificate: chat.certify(),
  });
  const { conversationId } = await (
    await postCommand(lender.context, "/api/chat/conversations", {
      userId: borrower.userId,
      context: { kind: "loan_request", requestId },
    })
  ).json();
  const laptop = await newContext();
  await signInThroughApi(laptop, lender.email);
  const linking = chat.certify();
  const { linkRequestId } = await (
    await postCommand(laptop, "/api/chat/links", {
      deviceId: linking.deviceId,
      deviceKey: linking.deviceKey,
      linkKey: linking.deviceKey,
    })
  ).json();

  const real: Ids = {
    environmentId,
    objectId,
    imageId,
    requestId,
    loanId,
    caseId,
    questionId,
    conversationId,
    linkRequestId,
    pictureId,
    invitationId,
    userId: lender.userId,
  };
  const nowhere: Ids = {
    ...(Object.fromEntries(
      Object.keys(real).map((key) => [key, randomUUID()]),
    ) as unknown as Ids),
    userId: (await person()).userId,
  };

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
