import { type BrowserContext, expect, type Page, test } from "@playwright/test";
import {
  accountId,
  axeViolations,
  blankMapTile,
  collectBrowserProblems,
  newEmail,
  postCommand,
  registerThroughApi,
  signInThroughApi,
  today,
  uniqueWord,
  untilOutboxSettles,
} from "./helpers";

/**
 * WP-65: every core page on a phone and on a desktop, with the keyboard and
 * for assistive technology (UX-A11Y-001–009, PS-NFR-010–011). The checks are
 * the same for every page, so a new page only needs a line in `pages`.
 */

const viewports = {
  phone: { width: 320, height: 640 },
  desktop: { width: 1280, height: 800 },
} as const;

interface World {
  readonly loanId: string;
  readonly requestId: string;
  readonly environmentId: string;
  readonly ownThing: string;
  readonly ladder: string;
  readonly place: string;
  readonly thing: string;
}

/** The signed-in pages, each in the state where it has the most to show. */
const pages: readonly { name: string; path: (world: World) => string }[] = [
  { name: "Hjem", path: () => "/" },
  { name: "Finn ting", path: ({ thing }) => `/finn?q=${thing}` },
  {
    name: "Finn miljøer",
    path: ({ place }) => `/finn?vis=miljoer&q=${place}`,
  },
  { name: "Lån", path: () => "/lan" },
  { name: "Lånet", path: ({ loanId }) => `/lan/${loanId}?historikk=1` },
  { name: "Mine ting", path: () => "/mine-ting" },
  { name: "Egen ting", path: ({ ownThing }) => `/ting/${ownThing}` },
  {
    name: "Registrer en ting",
    path: ({ environmentId }) => `/ting/ny?miljo=${environmentId}`,
  },
  {
    name: "Ting i et miljø",
    path: ({ ladder, environmentId }) =>
      `/ting/${ladder}?miljo=${environmentId}`,
  },
  {
    name: "Be om å låne",
    path: ({ ladder, environmentId }) =>
      `/ting/${ladder}/lan?miljo=${environmentId}`,
  },
  {
    name: "Forespørselen",
    path: ({ requestId }) => `/lan/foresporsel/${requestId}`,
  },
  { name: "Samtaler", path: () => "/samtaler" },
  { name: "Varsler", path: () => "/varsler" },
  { name: "Konto", path: () => "/konto" },
];

let world: World;
let signedIn: Awaited<ReturnType<BrowserContext["storageState"]>>;

/**
 * Bo, with something on every page: a loan waiting for its handover, a
 * friend request to answer, a co-ownership to accept, a block, an
 * environment with an area, and notifications.
 */
test.beforeAll(async ({ browser, playwright }) => {
  test.setTimeout(120_000);
  const baseURL = test.info().project.use.baseURL!;
  const user = (name: string) =>
    playwright.request
      .newContext({ baseURL, extraHTTPHeaders: { origin: baseURL } })
      .then(async (request) => {
        await registerThroughApi(request, undefined, name);
        return { request, id: await accountId(request) };
      });
  const context = await browser.newContext({ baseURL });
  const bo = context.request;
  await registerThroughApi(bo, undefined, "Bo Dahl");
  const boId = await accountId(bo);
  const [anna, cleo, dan] = await Promise.all([
    user("Anna Berg"),
    user("Cleo Eng"),
    user("Dan Fjeld"),
  ]);

  await postCommand(anna.request, "/api/social/friend-requests", {
    userId: boId,
  });
  await postCommand(bo, "/api/social/friend-requests/accept", {
    userId: anna.id,
  });
  await postCommand(cleo.request, "/api/social/friend-requests", {
    userId: boId,
  });
  await postCommand(bo, "/api/social/blocks", { userId: dan.id });

  const place = uniqueWord();
  const thing = uniqueWord();
  const { environmentId } = await (
    await postCommand(anna.request, "/api/environments", {
      name: `Nabolaget ${place}`,
      type: "open",
      location: "Grünerløkka",
      area: { latitude: 59.92, longitude: 10.76, radiusKm: 2 },
    })
  ).json();
  await postCommand(bo, "/api/environments/membership/join", {
    environmentId,
    answers: [],
  });
  const object = async (title: string) =>
    (
      await (
        await postCommand(anna.request, "/api/objects", {
          title,
          categoryId: "annet",
          description: "Aluminiumsstige, 4 meter.",
          availability: [{ start: today(), end: null }],
        })
      ).json()
    ).objectId as string;
  const ladder = await object(`Stige ${thing}`);
  await postCommand(anna.request, `/api/objects/${ladder}/publications`, {
    environmentId,
  });
  await postCommand(
    anna.request,
    `/api/objects/${await object("Tilhenger")}/co-owners/invitations`,
    { userId: boId },
  );
  const { objectId: ownThing } = await (
    await postCommand(bo, "/api/objects", {
      title: "Sykkel",
      categoryId: "annet",
      description: "Bysykkel med kurv.",
      availability: [{ start: today(), end: null }],
    })
  ).json();

  const preview = await (
    await bo.get(`/api/loan-requests/preview?objectId=${ladder}`)
  ).json();
  const { requestId } = await (
    await postCommand(bo, "/api/loan-requests", {
      objectId: ladder,
      origin: { kind: "direct" },
      start: { kind: "date", date: today() },
      end: { kind: "duration", days: 2 },
      message: "Kan jeg låne den i dag?",
      termsVersion: preview.termsVersion,
      responsibilityDeclarationVersion:
        preview.responsibilityDeclarationVersion,
    })
  ).json();
  await postCommand(
    anna.request,
    `/api/loan-requests/${requestId}/responsibility`,
    { declarationVersion: preview.responsibilityDeclarationVersion },
  );
  const { loanId } = await (
    await postCommand(anna.request, `/api/loan-requests/${requestId}/approve`)
  ).json();

  await untilOutboxSettles(bo, async () => {
    const [{ unreadCount }, { environments }] = await Promise.all([
      (await bo.get("/api/notifications/unread")).json(),
      (await bo.get(`/api/search/environments?q=${place}`)).json(),
    ]);
    return unreadCount > 0 && environments.length > 0;
  });

  world = {
    loanId,
    requestId,
    environmentId,
    ownThing,
    ladder,
    place,
    thing,
  };
  signedIn = await context.storageState();
  await context.close();
});

/** A page as Bo sees it, at `viewport`, with map tiles that never leave. */
async function open(
  browser: import("@playwright/test").Browser,
  viewport: { width: number; height: number },
  path: string,
  colorScheme: "light" | "dark" = "light",
) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL!,
    storageState: signedIn,
    viewport,
    colorScheme,
  });
  const page = await context.newPage();
  await page.route("https://cache.kartverket.no/**", (route) =>
    route.fulfill({ contentType: "image/png", body: blankMapTile }),
  );
  const problems = collectBrowserProblems(page);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return { page, problems };
}

/** UX-A11Y-001, WCAG 1.4.10: nothing needs scrolling sideways. */
const scrollsSideways = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);

/**
 * UX-A11Y-006: controls a finger aims at are at least 44 × 44 CSS pixels.
 * A link counts as a control when it stands alone, not inside running text.
 * The map's own zoom buttons are an extra; the list says what the map does.
 */
const smallTargets = (page: Page) =>
  page.evaluate(() => {
    const standalone = (link: Element) => {
      const parent = link.parentElement;
      return (
        parent !== null &&
        (parent.textContent ?? "").trim() === (link.textContent ?? "").trim()
      );
    };
    const targets = [
      ...document.querySelectorAll(
        "button, select, textarea, summary, input:not([type=hidden]):not([type=checkbox]), .checkbox, a[href]",
      ),
    ].filter(
      (element) =>
        !element.closest(".maplibregl-ctrl, .maplibregl-canvas-container") &&
        (element.tagName !== "A" || standalone(element)) &&
        element.getClientRects().length > 0,
    );

    return targets
      .filter((element) => {
        const { width, height } = element.getBoundingClientRect();
        return width < 44 || height < 44;
      })
      .map(
        (element) =>
          `${element.tagName.toLowerCase()} «${(element.textContent ?? "").trim().slice(0, 40)}»`,
      );
  });

/**
 * UX-A11Y-003, WCAG 2.1.1, 2.4.7, 2.4.11: Tab reaches every control in
 * turn, each shows a focus marker, and none is hidden behind the header or
 * the navigation when it has focus.
 */
async function keyboardProblems(page: Page) {
  const expected = await page.evaluate(() => {
    const focusable = [
      ...document.querySelectorAll<HTMLElement>(
        'a[href], button, input:not([type=hidden]), select, textarea, summary, [tabindex]:not([tabindex="-1"])',
      ),
    ].filter(
      (element) =>
        !(element as HTMLButtonElement).disabled &&
        element.getClientRects().length > 0 &&
        getComputedStyle(element).visibility !== "hidden",
    );
    focusable.forEach((element, index) => {
      element.dataset.a11y = String(index);
    });
    return focusable.length;
  });
  const reached = new Set<string>();
  const problems: string[] = [];

  // A date field takes a Tab for each of its parts.
  for (let step = 0; step <= expected * 3 + 2; step += 1) {
    await page.keyboard.press("Tab");
    const focus = await page.evaluate(() => {
      const element = document.activeElement as HTMLElement | null;

      if (!element || element === document.body) return null;

      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      const covering = document.elementFromPoint(
        Math.min(box.left + box.width / 2, window.innerWidth - 1),
        Math.min(box.top + box.height / 2, window.innerHeight - 1),
      );

      return {
        id: element.dataset.a11y ?? null,
        name: `${element.tagName.toLowerCase()} «${(element.textContent ?? element.getAttribute("aria-label") ?? "").trim().slice(0, 40)}»`,
        marked:
          (style.outlineStyle !== "none" &&
            Number.parseFloat(style.outlineWidth) >= 2) ||
          style.boxShadow !== "none",
        hidden:
          covering !== null &&
          !element.contains(covering) &&
          !covering.contains(element),
      };
    });

    if (!focus) {
      if (reached.size > 0) break;
      continue;
    }

    if (focus.id !== null) reached.add(focus.id);
    if (!focus.marked) problems.push(`no focus marker: ${focus.name}`);
    if (focus.hidden) problems.push(`hidden while focused: ${focus.name}`);
  }

  if (reached.size < expected) {
    problems.push(
      ...(await page.evaluate(
        (seen) =>
          [...document.querySelectorAll<HTMLElement>("[data-a11y]")]
            .filter((element) => !seen.includes(element.dataset.a11y!))
            .map(
              (element) =>
                `not reached by Tab: ${element.tagName.toLowerCase()} «${(element.textContent ?? "").trim().slice(0, 40)}»`,
            ),
        [...reached],
      )),
    );
  }

  return [...new Set(problems)];
}

for (const [device, viewport] of Object.entries(viewports)) {
  for (const { name, path } of pages) {
    test(`${name} on a ${device} meets WCAG, fits, and works by keyboard`, async ({
      browser,
    }) => {
      const { page, problems } = await open(browser, viewport, path(world));

      expect(await axeViolations(page)).toEqual([]);
      expect(await scrollsSideways(page)).toBe(false);
      expect(await smallTargets(page)).toEqual([]);
      expect(await keyboardProblems(page)).toEqual([]);
      expect(problems).toEqual([]);
      await page.context().close();
    });
  }
}

/**
 * WP-80: the dark colour scheme is the same design, so it has the same
 * contrast (WCAG 1.4.3, 1.4.11).
 */
for (const { name, path } of pages) {
  test(`${name} meets WCAG in dark mode`, async ({ browser }) => {
    const { page } = await open(browser, viewports.phone, path(world), "dark");

    expect(await axeViolations(page)).toEqual([]);
    await page.context().close();
  });
}

/**
 * UX-A11Y-007: with text twice as large, everything is still there: nothing
 * scrolls sideways, the end of the page is not hidden behind the
 * navigation, and neither is what has focus when the navigation has grown.
 */
for (const { name, path } of pages) {
  test(`${name} keeps working with twice as large text`, async ({
    browser,
  }) => {
    const { page } = await open(
      browser,
      { width: 390, height: 844 },
      path(world),
    );
    await page.addStyleTag({ content: "html { font-size: 200% !important }" });

    expect(await scrollsSideways(page)).toBe(false);
    const covered = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      const content = document.querySelector("main")!.getBoundingClientRect();
      const navigation = document
        .querySelector(".main-navigation")!
        .getBoundingClientRect();
      return content.bottom > navigation.top + 1 && navigation.top > 0
        ? content.bottom - navigation.top
        : 0;
    });
    expect(covered).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await keyboardProblems(page)).toEqual([]);
    await page.context().close();
  });
}

test("signing in and registering meet WCAG on a phone, by keyboard", async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL!,
    viewport: viewports.phone,
  });
  const page = await context.newPage();

  for (const path of ["/", "/logg-inn"]) {
    await page.goto(path);
    expect(await axeViolations(page)).toEqual([]);
    expect(await scrollsSideways(page)).toBe(false);
    expect(await smallTargets(page)).toEqual([]);
    expect(await keyboardProblems(page)).toEqual([]);
  }

  // The code step, reached with the keyboard alone.
  const email = newEmail();
  await page.getByLabel("E-postadresse").fill(email);
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Kode fra e-posten")).toBeFocused();
  expect(await axeViolations(page)).toEqual([]);

  // A wrong code is said in words, tied to the field it is about.
  await page.getByLabel("Kode fra e-posten").fill("000000");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("alert").filter({ hasText: "Koden er feil" }),
  ).toBeVisible();
  await expect(page.getByLabel("Kode fra e-posten")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  expect(await axeViolations(page)).toEqual([]);

  await signInThroughApi(page.request, newEmail());
  await page.goto("/registrering");
  expect(await axeViolations(page)).toEqual([]);
  expect(await smallTargets(page)).toEqual([]);
  expect(await keyboardProblems(page)).toEqual([]);
  await context.close();
});

/** The one live region the whole app announces through. */
const announcer = (page: Page) => page.locator("[aria-live=polite]");

/**
 * UX-A11Y-004, WCAG 4.1.3: an answer given with the keyboard is announced,
 * and focus stays in the page when the answered thing goes away.
 */
test("an answer is announced, and the keyboard is not lost", async ({
  page,
  playwright,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Kari Nordmann");
  const kari = await accountId(page.request);
  const other = await playwright.request.newContext({
    baseURL: baseURL!,
    extraHTTPHeaders: { origin: baseURL! },
  });
  await registerThroughApi(other, undefined, "Ola Hansen");
  await postCommand(other, "/api/social/friend-requests", { userId: kari });
  await page.goto("/konto");

  const friends = page.getByRole("region", { name: "Venner" });
  await friends.getByRole("button", { name: "Godta" }).focus();
  await page.keyboard.press("Enter");

  await expect(announcer(page)).toHaveText("Ferdig: Godta");
  await expect(friends.getByRole("button", { name: "Godta" })).toHaveCount(0);
  await expect(
    friends.getByRole("heading", { name: "Venner", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).not.toHaveCount(0);
  expect(problems).toEqual([]);
});

/**
 * UX-A11Y-009, PS-NFR-006: without a network the page says so in words, an
 * action that cannot be sent says it did not happen, and what was filled in
 * is kept.
 */
test("without a network the page says so, and keeps what was filled in", async ({
  page,
  context,
}) => {
  const email = newEmail();
  await page.goto("/logg-inn");
  await page.getByLabel("E-postadresse").fill(email);

  await context.setOffline(true);
  await expect(page.locator(".network-status")).toContainText(
    "Du er uten nett",
  );
  await expect(announcer(page)).toContainText("Du er uten nett");
  await page.getByRole("button", { name: "Send kode" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Fikk ikke kontakt" }),
  ).toHaveText(
    "Fikk ikke kontakt med Lånbort. Det du har fylt ut er beholdt. Prøv igjen.",
  );
  await expect(page.getByLabel("E-postadresse")).toHaveValue(email);

  await context.setOffline(false);
  await expect(page.locator(".network-status")).toHaveCount(0);
  await expect(announcer(page)).toHaveText("Du er tilkoblet igjen.");
  await page.getByRole("button", { name: "Send kode" }).click();
  await expect(page.getByLabel("Kode fra e-posten")).toBeFocused();
});

/** UX-A11Y-008: with reduced motion asked for, nothing moves by itself. */
test("reduced motion is respected", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL!,
    storageState: signedIn,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  await page.goto(`/lan/${world.loanId}`);
  await page.getByText("Historikk", { exact: true }).click();

  expect(
    await page.evaluate(
      () =>
        [...document.querySelectorAll("*")].filter((element) => {
          const style = getComputedStyle(element);
          return (
            Number.parseFloat(style.transitionDuration) > 0.01 ||
            Number.parseFloat(style.animationDuration) > 0.01
          );
        }).length,
    ),
  ).toBe(0);
  await context.close();
});
