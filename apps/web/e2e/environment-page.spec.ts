import { type Browser, expect, type Page, test } from "@playwright/test";
import {
  accountId,
  axeViolations,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  today,
  uniqueWord,
  untilOutboxSettles,
} from "./helpers";

/**
 * WP-84: an environment as a context in the browser. Created from Finn,
 * understood before joining (UX-JRN-002), joined with its requirements, used
 * by its members (things, members, the administrators) and left with its
 * consequences shown (UX-INT-007).
 */

/** Someone else, signed in in a browser of their own. */
async function person(browser: Browser, baseURL: string, name: string) {
  const context = await browser.newContext({ baseURL });
  await registerThroughApi(context.request, undefined, name);
  const page = await context.newPage();

  return { context, page, id: await accountId(context.request) };
}

test("an environment is created, applied to, used and left in the browser", async ({
  browser,
  page,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Anna Berg");
  const annaId = await accountId(page.request);
  const name = `Gården ${uniqueWord()}`;

  await page.goto("/finn?vis=miljoer");
  await page.getByRole("link", { name: "Opprett et miljø" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Opprett et miljø",
  );
  expect(await axeViolations(page)).toEqual([]);
  await page.getByLabel("Navn").fill(name);
  await page.getByLabel("Lukket miljø").check();
  await page.getByRole("button", { name: "Legg til et spørsmål" }).click();
  await page
    .getByLabel("1. Spørsmål nye medlemmer svarer på")
    .fill("Hvilken leilighet bor du i?");
  await page.getByRole("button", { name: "Legg til en regel" }).click();
  await page
    .getByLabel("2. Regel nye medlemmer godtar")
    .fill("Jeg godtar husreglene");
  await page.getByRole("button", { name: "Opprett miljøet" }).click();

  await expect(page).toHaveURL(/\/miljoer\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(page.getByText("Du er medlem.")).toBeVisible();
  await expect(page.getByText("Du er eier")).toBeVisible();
  const environmentId = page.url().split("/").at(-1)!;
  const { objectId } = await (
    await postCommand(page.request, "/api/objects", {
      title: "Stige",
      categoryId: "annet",
      description: "Aluminiumsstige, 4 meter.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await postCommand(page.request, `/api/objects/${objectId}/publications`, {
    environmentId,
  });

  // Bo understands the environment before applying, and sees no members.
  const bo = await person(browser, baseURL!, "Bo Dahl");
  await bo.page.goto(`/miljoer/${environmentId}`);
  await expect(bo.page.getByText("Lukket miljø").first()).toBeVisible();
  await expect(
    bo.page.getByText(
      "Alle kan finne miljøet, men en administrator godkjenner nye medlemmer.",
    ),
  ).toBeVisible();
  // About how many, never the exact number (PS-ENV-016).
  await expect(bo.page.getByText("under 10 medlemmer")).toBeVisible();
  await expect(
    bo.page.getByRole("heading", { name: /Andre medlemmer/ }),
  ).toHaveCount(0);
  const asks = bo.page.getByRole("region", { name: "For å bli med" });
  await expect(asks.getByText("Hvilken leilighet bor du i?")).toBeVisible();
  await expect(asks.getByText("Jeg godtar husreglene")).toBeVisible();

  // Applying is a task of its own, and the page shows what was sent.
  await bo.page.getByRole("link", { name: "Søk om å bli med" }).click();
  await expect(bo.page).toHaveURL(`/miljoer/${environmentId}/bli-med`);
  await expect(bo.page.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(bo.page.getByRole("link", { name: "Avbryt" })).toBeVisible();
  await expect(
    bo.page.getByText(/Administratorene ser navnet ditt og svarene over/),
  ).toBeVisible();
  expect(await axeViolations(bo.page)).toEqual([]);
  await bo.page.getByLabel("Hvilken leilighet bor du i?").fill("H0201");
  await bo.page.getByLabel("Jeg godtar husreglene").check();
  await bo.page.getByRole("button", { name: "Send søknaden" }).click();
  await expect(bo.page).toHaveURL(`/miljoer/${environmentId}`);
  await expect(
    bo.page.getByText("Søknaden din venter på svar fra administratorene."),
  ).toBeVisible();
  const sent = bo.page.getByRole("region", { name: "Søknaden din" });
  await expect(sent.getByText("H0201")).toBeVisible();
  await expect(sent.getByText("Godtatt")).toBeVisible();

  // Anna administers it, and finds the application among her tasks there.
  await page.reload();
  const administration = page.getByRole("region", {
    name: "Som administrator",
  });
  await expect(
    administration.getByRole("link", { name: "Behandle 1 innmelding" }),
  ).toHaveAttribute(
    "href",
    `/miljoer/${environmentId}/administrer/innmeldinger`,
  );
  await expect(
    administration.getByRole("link", { name: "Administrer miljøet" }),
  ).toBeVisible();

  const { memberships } = await (
    await page.request.get(
      `/api/environments/memberships?environmentId=${environmentId}`,
    )
  ).json();
  await postCommand(page.request, "/api/environments/memberships/approve", {
    environmentId,
    membershipId: memberships.find(
      (membership: { userId: string }) => membership.userId === bo.id,
    ).id,
  });

  // Bo is told (PS-ENV-017), and the notification opens the environment
  // with its welcome the first time.
  await untilOutboxSettles(bo.context.request, async () =>
    (
      await (await bo.context.request.get("/api/notifications")).json()
    ).notifications.some(
      (notification: { kind: string }) =>
        notification.kind === "environment.membership_approved",
    ),
  );
  await bo.page.goto("/varsler");
  await bo.page
    .getByRole("link", {
      name: new RegExp(`Søknaden din til ${name} er godkjent`),
    })
    .click();
  await expect(bo.page).toHaveURL(`/miljoer/${environmentId}`);
  await expect(bo.page.getByText(/^Velkommen, Bo/)).toBeVisible();

  // As a member, Bo finds the thing, Anna and the administrators.
  await bo.page.reload();
  await expect(bo.page.getByText("Du er medlem.")).toBeVisible();
  await expect(bo.page.getByRole("link", { name: "Stige" })).toHaveAttribute(
    "href",
    `/ting/${objectId}?miljo=${environmentId}`,
  );
  const things = bo.page.getByRole("region", { name: "Ting i miljøet" });
  await expect(things.getByText(/Eier: Anna Berg/)).toBeVisible();
  await expect(things.getByRole("link", { name: "Anna Berg" })).toHaveAttribute(
    "href",
    `/personer/${annaId}?rolle=utlaaner`,
  );
  await expect(
    bo.page.getByRole("link", { name: "Registrer en ting her" }),
  ).toHaveAttribute("href", `/ting/ny?miljo=${environmentId}`);
  await expect(
    bo.page.getByRole("region", { name: "Som administrator" }),
  ).toHaveCount(0);

  // Searching among the things here finds them as in Finn.
  await untilOutboxSettles(bo.context.request, async () => {
    const { objects } = await (
      await bo.context.request.get(
        `/api/search/objects?q=Stige&environmentId=${environmentId}`,
      )
    ).json();
    return objects.length > 0;
  });
  await bo.page.getByLabel(`Søk i ${name}`).fill("Stige");
  await bo.page
    .getByRole("search")
    .getByRole("button", { name: "Søk" })
    .click();
  const found = bo.page.getByRole("region", { name: "1 ting for «Stige»" });
  await expect(found.getByRole("link", { name: "Stige" })).toHaveAttribute(
    "href",
    `/ting/${objectId}?miljo=${environmentId}`,
  );
  await found.getByRole("link", { name: "Vis alle ting" }).click();
  await expect(
    bo.page.getByRole("region", { name: "Ting i miljøet" }),
  ).toBeVisible();

  // About the environment and its members, a page away.
  await bo.page.getByRole("link", { name: "Om miljøet og medlemmer" }).click();
  await expect(bo.page.getByRole("heading", { level: 1 })).toHaveText(
    `Om ${name}`,
  );
  await expect(
    bo.page
      .getByRole("region", { name: /Andre medlemmer/ })
      .getByRole("link", { name: "Anna Berg" }),
  ).toHaveAttribute("href", `/personer/${annaId}`);
  await expect(
    bo.page.getByRole("link", { name: "Kontakt administratorene" }),
  ).toHaveAttribute("href", `/saker/ny?kontakt=${environmentId}`);
  await expect(bo.page.getByText("Hvilken leilighet bor du i?")).toBeVisible();
  await expect(bo.page.getByText("H0201")).toHaveCount(0);

  // Leaving says what goes and what stays before it happens.
  await bo.page.getByRole("button", { name: "Forlat miljøet" }).click();
  const dialog = bo.page.getByRole("dialog");
  await expect(
    dialog.getByText("Lån som allerede er avtalt, fortsetter som før."),
  ).toBeVisible();
  await expect(
    dialog.getByText("For å bli med igjen må du søke på nytt."),
  ).toBeVisible();
  await dialog.getByRole("button", { name: `Forlat ${name}` }).click();
  await expect(
    bo.page.getByText(/Du er ikke medlem\. En administrator ser på søknaden/),
  ).toBeVisible();
  await expect(bo.page.getByRole("link", { name: "Stige" })).toHaveCount(0);

  await bo.context.close();
  expect(problems).toEqual([]);
});

/** Anna's closed environment, where she has rejected Bo's application. */
async function rejectedApplication(
  browser: Browser,
  page: Page,
  baseURL: string,
  options: { restrict?: true } = {},
) {
  await registerThroughApi(page.request, undefined, "Anna Berg");
  const { environmentId } = await (
    await postCommand(page.request, "/api/environments", {
      name: `Gården ${uniqueWord()}`,
      type: "closed",
    })
  ).json();
  const bo = await person(browser, baseURL, "Bo Lien");
  const { membershipId } = await (
    await postCommand(bo.context.request, "/api/environments/membership/join", {
      environmentId,
      answers: [],
    })
  ).json();
  await postCommand(page.request, "/api/environments/memberships/reject", {
    environmentId,
    membershipId,
    ...options,
  });

  return { environmentId, bo };
}

test("a rejected application is said neutrally on the environment's page (PS-ENV-017)", async ({
  browser,
  page,
  baseURL,
}) => {
  const { environmentId, bo } = await rejectedApplication(
    browser,
    page,
    baseURL!,
  );

  await bo.page.goto(`/miljoer/${environmentId}`);
  const status = bo.page.getByRole("region", { name: "Status" });
  await expect(
    status.getByText("Ikke godkjent", { exact: true }),
  ).toBeVisible();
  await expect(status.getByText("Søknaden ble ikke godkjent.")).toBeVisible();
  // Never why, who decided or whether it may be tried again.
  await expect(status).not.toContainText(/Anna|administrator/i);
  await expect(
    status.getByRole("link", { name: "Finn andre miljøer" }),
  ).toHaveAttribute("href", "/finn?vis=miljoer");
  expect(await axeViolations(bo.page)).toEqual([]);

  // Applying again is as before; then the page says it waits.
  await status.getByRole("button", { name: "Send søknaden" }).click();
  await expect(
    bo.page.getByText("Søknaden din venter på svar fra administratorene."),
  ).toBeVisible();
  await bo.context.close();
});

test("someone barred from new attempts sees that they cannot apply now (PS-ENV-020)", async ({
  browser,
  page,
  baseURL,
}) => {
  const { environmentId, bo } = await rejectedApplication(
    browser,
    page,
    baseURL!,
    { restrict: true },
  );

  await bo.page.goto(`/miljoer/${environmentId}`);
  const status = bo.page.getByRole("region", { name: "Status" });
  await expect(
    status.getByText("Du kan ikke søke om å bli med nå."),
  ).toBeVisible();
  await expect(status).not.toContainText(/Anna|administrator/i);
  await expect(status.getByRole("button")).toHaveCount(0);
  await expect(
    status.getByRole("link", { name: "Finn andre miljøer" }),
  ).toBeVisible();
  await expect(status.getByRole("link")).toHaveCount(1);
  expect(await axeViolations(bo.page)).toEqual([]);

  // The way to applying is gone too.
  await bo.page.goto(`/miljoer/${environmentId}/bli-med`);
  await expect(bo.page).toHaveURL(`/miljoer/${environmentId}`);
  await bo.context.close();
});

test("an invitation to a hidden environment is accepted on its page, and members answer a weaker type there", async ({
  browser,
  page,
  baseURL,
}) => {
  await registerThroughApi(page.request, undefined, "Eva Eier");
  const name = `Hemmelig ${uniqueWord()}`;
  const { environmentId } = await (
    await postCommand(page.request, "/api/environments", {
      name,
      type: "hidden",
      requirements: [
        { kind: "acceptance", text: "Jeg holder miljøet for meg selv" },
      ],
    })
  ).json();
  const bo = await person(browser, baseURL!, "Bo Dahl");
  const outsider = await person(browser, baseURL!, "Cleo Eng");

  // To anyone not invited, the hidden environment does not exist.
  const unknown = await outsider.page.goto(`/miljoer/${environmentId}`);
  expect(unknown?.status()).toBe(404);

  await postCommand(page.request, "/api/environments/memberships/invite", {
    environmentId,
    userId: bo.id,
  });
  await bo.page.goto(`/miljoer/${environmentId}`);
  await expect(bo.page.getByText(/Du er invitert til miljøet/)).toBeVisible();
  await bo.page.getByRole("link", { name: "Bli med" }).click();
  await bo.page.getByLabel("Jeg holder miljøet for meg selv").check();
  await bo.page
    .getByRole("button", { name: `Godta invitasjonen til ${name}` })
    .click();

  // The first visit as a member welcomes; later visits do not.
  await expect(bo.page.getByText("Velkommen, Bo")).toBeVisible();
  await expect(bo.page).toHaveURL(`/miljoer/${environmentId}`);
  await bo.page.reload();
  await expect(bo.page.getByText("Du er medlem.")).toBeVisible();
  await expect(bo.page.getByText("Velkommen, Bo")).toHaveCount(0);
  await bo.page.getByRole("link", { name: "Om miljøet og medlemmer" }).click();
  await expect(bo.page.getByRole("link", { name: "Eva Eier" })).toBeVisible();
  await bo.page.goto(`/miljoer/${environmentId}`);

  // A weaker type is each member's own choice (UX-PRIV-008): hidden →
  // closed is a vote, and those without a yes are removed if it passes.
  await postCommand(page.request, "/api/environments/type", {
    environmentId,
    type: "closed",
    expectedType: "hidden",
  });
  await bo.page.reload();
  const vote = bo.page.getByRole("region", {
    name: "Administratorene foreslår å gjøre miljøet lukket",
  });
  await expect(
    vote.getByText(/minst 2 av 3 aktive medlemmer godtar den/),
  ).toBeVisible();
  await expect(
    vote.getByText(/blir de som ikke har godtatt, fjernet fra miljøet/),
  ).toBeVisible();
  await vote
    .getByRole("button", { name: "Godta at miljøet blir lukket" })
    .click();
  await expect(vote.getByText("Du har godtatt endringen.")).toBeVisible();

  const closed = await (
    await postCommand(page.request, "/api/environments", {
      name: `Lukket ${uniqueWord()}`,
      type: "closed",
    })
  ).json();
  await postCommand(page.request, "/api/environments/memberships/invite", {
    environmentId: closed.environmentId,
    userId: bo.id,
  });
  await postCommand(bo.context.request, "/api/environments/membership/accept", {
    environmentId: closed.environmentId,
    answers: [],
  });
  await postCommand(page.request, "/api/environments/type", {
    environmentId: closed.environmentId,
    type: "open",
    expectedType: "closed",
  });
  await bo.page.goto(`/miljoer/${closed.environmentId}`);
  const proposal = bo.page.getByRole("region", {
    name: "Administratorene foreslår å gjøre miljøet åpent",
  });
  await expect(
    proposal.getByText(/Godtar du ikke innen fristen, blir du passivt medlem/),
  ).toBeVisible();
  await expect(proposal.getByText("Du har ikke svart ennå.")).toBeVisible();
  await proposal
    .getByRole("button", { name: "Godta at miljøet blir åpent" })
    .click();
  await expect(proposal.getByText("Du har godtatt endringen.")).toBeVisible();

  await Promise.all([bo.context.close(), outsider.context.close()]);
});
