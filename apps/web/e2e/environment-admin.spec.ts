import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import {
  accountId,
  befriend,
  axeViolations,
  collectBrowserProblems,
  postCommand,
  registerThroughApi,
  today,
  uniqueWord,
  untilOutboxSettles,
} from "./helpers";

/**
 * WP-85: an environment's administration as tasks on the environment
 * (UX-JRN-012), each on its own page under «Administrer miljøet»: an
 * application decided with the answers in view, a thing
 * approved, a weaker type proposed with its consequences shown first
 * (UX-INT-007, UX-PRIV-008). Members without a role see no such page.
 */
test("administrators decide memberships, things and the type on the environment", async ({
  browser,
  page,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Eva Eier");
  const word = uniqueWord();
  const { environmentId } = await (
    await postCommand(page.request, "/api/environments", {
      name: `Borettslaget ${word}`,
      type: "closed",
      requirements: [{ kind: "information", text: "Hvilken leilighet?" }],
    })
  ).json();
  const adminPage = `/miljoer/${environmentId}/administrer`;

  const kari = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(kari.request, undefined, "Kari Nord");
  const { requirements } = await (
    await kari.request.get(
      `/api/environments/details?environmentId=${environmentId}`,
    )
  ).json();
  await postCommand(kari.request, "/api/environments/membership/join", {
    environmentId,
    answers: [{ requirementId: requirements[0].id, answer: "H0201" }],
  });

  // «Administrer miljøet» starts with what waits, each leading to its page.
  await page.goto(adminPage);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Administrer miljøet",
  );
  await expect(page.getByText("1 avgjørelse venter")).toBeVisible();
  const waitingTasks = page.getByRole("region", { name: "Venter på dere" });
  await waitingTasks
    .getByRole("link", { name: /Innmeldinger.*Kari Nord/ })
    .click();
  await expect(page).toHaveURL(`${adminPage}/innmeldinger`);
  const applications = page.getByRole("region", {
    name: /Venter på avgjørelse/,
  });
  await applications.getByText("Svar til miljøets innmelding").click();
  await expect(applications.getByText("H0201")).toBeVisible();
  await applications
    .getByRole("button", { name: "Godkjenn Kari Nord" })
    .click();
  await expect(page.getByText("Ingen innmeldinger venter.")).toBeVisible();

  // Things need approval once it is required; the dialog says what happens.
  await page.goto(adminPage);
  await expect(page.getByText("Ingen avgjørelser venter på deg")).toBeVisible();
  await page
    .getByRole("region", { name: "Miljøet" })
    .getByRole("link", { name: /Ting i miljøet/ })
    .click();
  await expect(page).toHaveURL(`${adminPage}/ting`);
  await page.getByRole("button", { name: "Krev godkjenning" }).click();
  const approvalDialog = page.getByRole("dialog", {
    name: "Krev godkjenning av nye ting",
  });
  await expect(
    approvalDialog.getByText("Nye ting må godkjennes før medlemmene ser dem."),
  ).toBeVisible();
  await approvalDialog
    .getByRole("button", { name: "Krev godkjenning" })
    .click();
  await expect(
    page.getByText(
      "Nye ting må godkjennes av en administrator før medlemmene ser dem.",
    ),
  ).toBeVisible();

  const { objectId } = await (
    await postCommand(kari.request, "/api/objects", {
      title: `Stige ${word}`,
      categoryId: "annet",
      description: "Aluminiumsstige, 4 meter.",
      availability: [{ start: today(), end: null }],
    })
  ).json();
  await postCommand(kari.request, `/api/objects/${objectId}/publications`, {
    environmentId,
  });
  await page.goto(adminPage);
  await waitingTasks
    .getByRole("link", {
      name: new RegExp(`Ting til godkjenning.*Stige ${word}`),
    })
    .click();
  await expect(page).toHaveURL(`${adminPage}/ting`);
  const waiting = page.getByRole("region", { name: "Venter på godkjenning" });
  await expect(
    waiting.getByText(`Stige ${word}`, { exact: true }),
  ).toBeVisible();
  await expect(waiting.getByText("lagt ut av Kari Nord")).toBeVisible();
  await waiting.getByRole("button", { name: "Godkjenn" }).click();
  await expect(
    page
      .getByRole("region", { name: "Synlige for medlemmene" })
      .getByText(`Stige ${word}`, { exact: true }),
  ).toBeVisible();

  // A weaker type is only proposed, after its consequences are shown.
  await page.goto(`${adminPage}/miljotype`);
  await page.getByRole("button", { name: "Foreslå åpent miljø" }).click();
  const proposal = page.getByRole("dialog", {
    name: "Foreslå at miljøet blir åpent",
  });
  await expect(
    proposal.getByText(/får 7 dager til å godta at miljøet blir åpent/),
  ).toBeVisible();
  await proposal
    .getByRole("button", { name: "Send forslaget til medlemmene" })
    .click();
  await expect(page.getByText("Foreslått: åpent miljø")).toBeVisible();
  await page.goto(adminPage);
  await expect(
    page
      .getByRole("region", { name: "Miljøet" })
      .getByRole("link", { name: /Miljøtype.*Forslag om åpent miljø/ }),
  ).toBeVisible();

  // A member without a role finds no administration, nor any of its pages.
  const other = await kari.newPage();
  for (const path of [adminPage, `${adminPage}/innmeldinger`]) {
    expect((await other.goto(path))?.status()).toBe(404);
  }
  await kari.close();
  expect(problems).toEqual([]);
});

/**
 * PS-ENV-004: someone rejected and barred is still listed by name among
 * the members once the application has ended, cannot be invited, and can
 * apply again once an administrator lifts the bar.
 */
test("a barred applicant stays listed until the bar is lifted", async ({
  browser,
  page,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Eva Eier");
  const word = uniqueWord();
  const { environmentId } = await (
    await postCommand(page.request, "/api/environments", {
      name: `Vellet ${word}`,
      type: "closed",
    })
  ).json();

  const ola = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(ola.request, undefined, "Ola Vest");
  await postCommand(page.request, "/api/social/friend-requests", {
    userId: await accountId(ola.request),
  });
  await postCommand(ola.request, "/api/social/friend-requests/accept", {
    userId: await accountId(page.request),
  });
  const apply = () =>
    ola.request.post("/api/environments/membership/join", {
      data: { environmentId, answers: [] },
      headers: { "Idempotency-Key": crypto.randomUUID() },
    });
  expect((await apply()).ok()).toBe(true);

  const adminPage = `/miljoer/${environmentId}/administrer`;
  await page.goto(`${adminPage}/innmeldinger`);
  const applications = page.getByRole("region", {
    name: /Venter på avgjørelse/,
  });
  await applications
    .getByRole("group", { name: "Ola Vest" })
    .getByText("Flere valg")
    .click();
  await applications
    .getByRole("button", { name: "Avvis og steng ute", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "Avvis og steng ute Ola Vest" })
    .getByRole("button", { name: "Avvis og steng ute Ola Vest" })
    .click();
  await expect(page.getByText("Ingen innmeldinger venter.")).toBeVisible();
  // A barred friend is not offered as someone to invite.
  await expect(page.getByRole("option", { name: "Ola Vest" })).toHaveCount(0);
  expect((await apply()).status()).toBe(403);

  // The bar is listed among the members until it is lifted.
  await page.goto(`${adminPage}/medlemmer`);
  const barredList = page.getByRole("region", {
    name: /Stengt ute fra nye forsøk/,
  });
  const barred = barredList.getByRole("listitem").filter({
    hasText: "Ola Vest",
  });
  await expect(barred.getByText(/Kan ikke søke eller inviteres/)).toBeVisible();
  await barred.getByRole("button", { name: "Opphev utestengelsen" }).click();
  await expect(
    barredList.getByText("Ingen utestengelser du kan se."),
  ).toBeVisible();
  expect((await apply()).ok()).toBe(true);

  // Bars from before the administrator came are lifted without the page
  // telling whether there were any (PS-ENV-009).
  await barredList.getByText("Tidligere utestengelser").click();
  await barredList
    .getByRole("button", { name: "Opphev utestengelser fra før du ble med" })
    .click();
  await page
    .getByRole("dialog", { name: "Opphev utestengelser fra før du ble med" })
    .getByRole("button", { name: "Opphev utestengelsene" })
    .click();
  await expect(
    page.getByRole("dialog", {
      name: "Opphev utestengelser fra før du ble med",
    }),
  ).toBeHidden();
  await page.goto(`${adminPage}/innmeldinger`);
  await expect(
    applications.getByRole("button", { name: "Godkjenn Ola Vest" }),
  ).toBeVisible();
  await ola.close();
  expect(problems).toEqual([]);
});

/**
 * PS-ENV-019: the administrators ask for more with one short question. The
 * applicant is notified, reads it verbatim on the application, from the
 * administrators as a group, and it goes once the answers are sent again.
 */
test("administrators ask an applicant one question, which the applicant reads verbatim", async ({
  browser,
  page,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Eva Eier");
  const name = `Borettslaget ${uniqueWord()}`;
  const { environmentId } = await (
    await postCommand(page.request, "/api/environments", {
      name,
      type: "closed",
      requirements: [{ kind: "information", text: "Hvilken leilighet?" }],
    })
  ).json();
  const kari = await browser.newContext({ baseURL: baseURL! });
  const kariPage = await kari.newPage();
  await registerThroughApi(kari.request, undefined, "Kari Nord");
  const { requirements } = await (
    await kari.request.get(
      `/api/environments/details?environmentId=${environmentId}`,
    )
  ).json();
  await postCommand(kari.request, "/api/environments/membership/join", {
    environmentId,
    answers: [{ requirementId: requirements[0].id, answer: "H0201" }],
  });
  const question = "Står du på kontrakten for H0201?";

  await page.goto(`/miljoer/${environmentId}/administrer/innmeldinger`);
  await page.getByRole("button", { name: "Be om mer informasjon" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Be Kari Nord om mer informasjon?",
  });
  await expect(
    dialog.getByText(new RegExp(`fra «Administratorene i ${name}»`)),
  ).toBeVisible();
  await dialog
    .getByLabel("Spørsmål til Kari Nord (valgfritt)")
    .fill(`${question}  `);
  await dialog.getByRole("button", { name: "Be om mer informasjon" }).click();
  await expect(dialog).toBeHidden();
  await expect(
    page.getByText("Venter på mer informasjon fra søkeren"),
  ).toBeVisible();
  await expect(page.getByText(`«${question}»`)).toBeVisible();

  // The applicant is told who asks, never what, and reads it on the page.
  await untilOutboxSettles(kari.request, async () =>
    (
      await (await kari.request.get("/api/notifications")).json()
    ).notifications.some(
      (notification: { kind: string }) =>
        notification.kind === "environment.membership_information_requested",
    ),
  );
  await kariPage.goto("/varsler");
  await kariPage
    .getByRole("link", {
      name: new RegExp(`Administratorene i ${name} ber om mer informasjon`),
    })
    .click();
  await expect(kariPage).toHaveURL(`/miljoer/${environmentId}`);
  const status = kariPage.getByRole("region", { name: "Status" });
  await expect(status.getByText(`Administratorene i ${name}`)).toBeVisible();
  await expect(status.getByText(`«${question}»`)).toBeVisible();
  await expect(status).not.toContainText("Eva");
  await expect(status).not.toContainText("Se over svarene dine");

  await status.getByRole("link", { name: "Se over svarene" }).click();
  await expect(kariPage.getByText(`«${question}»`)).toBeVisible();
  await kariPage.getByRole("button", { name: "Send svarene" }).click();
  await expect(
    kariPage.getByText("Søknaden din venter på svar fra administratorene."),
  ).toBeVisible();
  await expect(kariPage.getByText(`«${question}»`)).toHaveCount(0);

  await kari.close();
  expect(problems).toEqual([]);
});

test("an impartial administrator removes a member, who is told neutrally and may ask for a new assessment (PS-ENV-021)", async ({
  browser,
  page,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Eva Eier");
  const name = `Kretsen ${uniqueWord()}`;
  const { environmentId } = await (
    await postCommand(page.request, "/api/environments", {
      name,
      type: "hidden",
    })
  ).json();
  const per = await browser.newContext({ baseURL: baseURL! });
  const perPage = await per.newPage();
  await registerThroughApi(per.request, undefined, "Per Lien");
  await befriend(page.request, per.request);
  await postCommand(page.request, "/api/environments/memberships/invite", {
    environmentId,
    userId: await accountId(per.request),
  });
  await postCommand(per.request, "/api/environments/membership/accept", {
    environmentId,
    answers: [],
  });
  const reason = "Har gjentatte ganger lånt ut andres ting videre.";

  await page.goto(`/miljoer/${environmentId}/administrer/medlemmer`);
  // Only Per: never the administrator themselves.
  await expect(
    page.getByRole("button", { name: "Fjern fra miljøet" }),
  ).toHaveCount(1);
  await page
    .getByRole("group", { name: "Per Lien" })
    .getByRole("button", { name: "Fjern fra miljøet" })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Fjerne Per Lien fra miljøet?",
  });
  await expect(
    dialog.getByText(/Lån som er godkjent, fortsetter/),
  ).toBeVisible();
  await expect(
    dialog.getByLabel("Steng Per Lien også ute fra nye forsøk"),
  ).not.toBeChecked();
  expect(await axeViolations(page)).toEqual([]);
  await dialog.getByLabel("Begrunnelse").fill(reason);
  await dialog.getByLabel("Steng Per Lien også ute fra nye forsøk").check();
  await dialog
    .getByRole("button", { name: "Fjern Per Lien fra miljøet" })
    .click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("group", { name: "Per Lien" })).toHaveCount(1);
  await expect(
    page.getByRole("region", { name: "Stengt ute fra nye forsøk" }),
  ).toContainText("Per Lien");

  // Per is told what it means and why, never who decided or reported.
  await untilOutboxSettles(per.request, async () =>
    (
      await (await per.request.get("/api/notifications")).json()
    ).notifications.some(
      (notification: { kind: string }) =>
        notification.kind === "moderation.measure_taken",
    ),
  );
  await perPage.goto("/varsler");
  await perPage
    .getByRole("link", { name: /Medlemskapet ditt i et miljø er avsluttet/ })
    .click();
  await expect(perPage).toHaveURL(/\/saker\/tiltak\/[0-9a-f-]{36}$/);
  await expect(perPage.getByRole("heading", { level: 1 })).toHaveText(name);
  await expect(perPage.getByRole("main")).toContainText(
    `Medlemskapet ditt i ${name} er avsluttet`,
  );
  await expect(perPage.getByRole("main")).toContainText(
    `Begrunnelse: ${reason}`,
  );
  // The environment's random name may hold any letters, so it is left out.
  expect(
    (await perPage.getByRole("main").innerText()).replaceAll(name, ""),
  ).not.toMatch(/Eva|rapport/i);
  expect(await axeViolations(perPage)).toEqual([]);

  // The hidden environment is gone for Per, but the way back is not.
  await perPage.getByRole("link", { name: "Be om ny vurdering" }).click();
  await perPage.getByLabel("Melding").fill("Jeg vil be om en ny vurdering.");
  await perPage
    .getByRole("button", { name: "Send til administratorene" })
    .click();
  await expect(perPage).toHaveURL(/\/saker\/[0-9a-f-]{36}$/);

  await per.close();
  expect(problems).toEqual([]);
});

test("an administrator invites someone from a shared environment from that person's page, and nobody they cannot see (PS-ENV-018)", async ({
  browser,
  page,
  baseURL,
}) => {
  const problems = collectBrowserProblems(page);
  await registerThroughApi(page.request, undefined, "Eva Eier");
  const word = uniqueWord();
  const environment = async (name: string, type: string) =>
    (
      await (
        await postCommand(page.request, "/api/environments", { name, type })
      ).json()
    ).environmentId as string;
  const shared = await environment(`Gata ${word}`, "open");
  const hidden = await environment(`Kretsen ${word}`, "hidden");

  // Per is no friend of Eva's; she sees him because both are in Gata.
  const per = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(per.request, undefined, "Per Lien");
  await postCommand(per.request, "/api/environments/membership/join", {
    environmentId: shared,
    answers: [],
  });
  const stranger = await browser.newContext({ baseURL: baseURL! });
  await registerThroughApi(stranger.request);

  await page.goto(`/personer/${await accountId(per.request)}`);
  const invite = page.getByRole("region", {
    name: "Inviter til et miljø du administrerer",
  });
  // An open environment needs no invitation.
  await expect(invite.getByRole("group")).toHaveCount(1);
  expect(await axeViolations(page)).toEqual([]);
  await invite
    .getByRole("group", { name: `Kretsen ${word}` })
    .getByRole("button", { name: `Inviter til Kretsen ${word}` })
    .click();
  await expect(invite).toBeHidden();
  expect(await (await per.request.get("/api/environments")).json()).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: hidden, membershipState: "pending" }),
    ]),
  );

  // Someone Eva cannot see has no page, and cannot be invited either: the
  // same answer as for an account that does not exist.
  const strangerId = await accountId(stranger.request);
  expect((await page.request.get(`/personer/${strangerId}`)).status()).toBe(
    404,
  );
  for (const userId of [strangerId, randomUUID()]) {
    const response = await page.request.post(
      "/api/environments/memberships/invite",
      {
        data: { environmentId: hidden, userId },
        headers: { "Idempotency-Key": randomUUID() },
      },
    );
    expect(response.status()).toBe(404);
  }

  await Promise.all([per.close(), stranger.close()]);
  expect(problems).toEqual([]);
});
