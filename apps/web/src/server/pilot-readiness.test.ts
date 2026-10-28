import type { PilotCheckResult } from "@lanbort/contracts";
import { describe, expect, it } from "vitest";
import { type PilotCheckDeps, runPilotChecks } from "./pilot-readiness";

const now = new Date("2026-10-28T09:00:00Z");
const sha = "c9243ef892622774ecc99588d1d1f4fb1b5b84d2";
const published = {
  VERCEL_ENV: "production",
  VERCEL_GIT_PROVIDER: "github",
  VERCEL_GIT_REPO_OWNER: "eier",
  VERCEL_GIT_REPO_SLUG: "lanbort",
  VERCEL_GIT_COMMIT_SHA: sha,
  VERCEL_GIT_COMMIT_REF: "main",
  OPERATOR_NAME: "Ansvarlig",
  CONTACT_EMAIL: "sikkerhet@example.no",
};

type Answers = Record<string, unknown>;

/** GitHub and the site as a healthy, protected repository answers. */
const healthy: Answers = {
  "": { default_branch: "main" },
  "/branches/main": {
    name: "main",
    commit: { sha },
    protection: {
      required_status_checks: {
        enforcement_level: "everyone",
        contexts: ["quality"],
      },
    },
  },
  "/rules/branches/main": [],
  [`/commits/${sha}/check-runs?per_page=100`]: {
    check_runs: ["quality", "database", "e2e", "security"].map((name) => ({
      name,
      status: "completed",
      conclusion: "success",
      app: { slug: "github-actions" },
    })),
  },
  "/actions/workflows/restore-drill.yml/runs?branch=main&status=completed&per_page=1":
    {
      workflow_runs: [
        {
          conclusion: "success",
          updated_at: "2026-10-11T07:36:27Z",
          html_url: "https://github.com/eier/lanbort/actions/runs/1",
        },
      ],
    },
  "/private-vulnerability-reporting": { enabled: true },
};

const securityTxt =
  "Contact: mailto:x@example.no\nExpires: 2027-10-01T00:00:00.000Z\n";

function fakeFetch(answers: Answers, status = 200): typeof fetch {
  return (async (input: string | URL) => {
    const url = new URL(String(input));

    if (url.pathname === "/.well-known/security.txt") {
      return new Response(securityTxt);
    }

    const path = `${url.pathname}${url.search}`.replace(
      "/repos/eier/lanbort",
      "",
    );

    return path in answers
      ? new Response(JSON.stringify(answers[path]), {
          status,
          headers: { "x-ratelimit-remaining": status === 403 ? "0" : "10" },
        })
      : new Response("{}", { status: 404 });
  }) as typeof fetch;
}

/** A database that cannot be reached: its checks end unchecked. */
const noDatabase = {
  db: new Proxy(
    {},
    {
      get() {
        throw new Error("no database here");
      },
    },
  ),
} as unknown as PilotCheckDeps["domain"];

const deps = (overrides: Partial<PilotCheckDeps> = {}): PilotCheckDeps => ({
  domain: noDatabase,
  now,
  env: published,
  fetch: fakeFetch(healthy),
  migrations: [],
  origin: "https://www.example.no",
  emailConfigured: true,
  newAccountsOpen: async () => false,
  ...overrides,
});

const byId = (results: PilotCheckResult[]) =>
  Object.fromEntries(results.map((result) => [result.requirementId, result]));

describe("the pilot's automatic readiness checks", () => {
  it("pass on a healthy, published deployment, each with its ground", async () => {
    const results = byId(await runPilotChecks(deps()));

    for (const id of [
      "ci",
      "deploy",
      "protected-flow",
      "restore-drill",
      "signup-closed",
      "contact",
    ]) {
      expect(results[id], id).toMatchObject({ status: "passed" });
      expect(results[id]!.details.length, id).toBeGreaterThan(0);
    }
    expect(results.ci!.summary).toBe(
      "Alle 4 testkjøringene er grønne for versjonen som er publisert.",
    );
    expect(results.ci!.links).toEqual([
      {
        label: "Testkjøringene på GitHub",
        href: `https://github.com/eier/lanbort/commit/${sha}/checks`,
      },
    ]);
  });

  it("never pass without an answer: the database's checks end unchecked", async () => {
    const results = byId(
      await runPilotChecks(deps({ migrations: ["20261028070000"] })),
    );

    for (const id of ["migrations", "email", "journal-private"]) {
      expect(results[id], id).toMatchObject({
        status: "unchecked",
        summary: "Fikk ikke svar fra databasen. Prøv igjen om en stund.",
      });
    }
  });

  it("fail on what they find wrong", async () => {
    const results = byId(
      await runPilotChecks(
        deps({
          fetch: fakeFetch({
            ...healthy,
            "/branches/main": { name: "main", commit: { sha: "f".repeat(40) } },
            [`/commits/${sha}/check-runs?per_page=100`]: {
              check_runs: [
                {
                  name: "e2e",
                  status: "completed",
                  conclusion: "failure",
                  app: { slug: "github-actions" },
                },
              ],
            },
            "/actions/workflows/restore-drill.yml/runs?branch=main&status=completed&per_page=1":
              {
                workflow_runs: [
                  {
                    conclusion: "success",
                    updated_at: "2026-09-01T03:20:00Z",
                    html_url: "https://github.com/eier/lanbort/actions/runs/1",
                  },
                ],
              },
            "/private-vulnerability-reporting": { enabled: false },
          }),
          env: { ...published, CONTACT_EMAIL: undefined },
          newAccountsOpen: async () => true,
        }),
      ),
    );

    expect(results.ci).toMatchObject({
      status: "failed",
      details: [`Versjon ${sha.slice(0, 7)}.`, "e2e: failure"],
    });
    expect(results.deploy!.status).toBe("failed");
    expect(results["protected-flow"]).toMatchObject({
      status: "failed",
      summary:
        "main er ikke beskyttet: en endring kan slås sammen og publiseres uten grønne tester.",
    });
    expect(results["restore-drill"]).toMatchObject({
      status: "failed",
      summary: "Den siste vellykkede øvelsen er 57 dager gammel.",
    });
    expect(results["signup-closed"]!.status).toBe("failed");
    expect(results.contact).toMatchObject({
      status: "failed",
      summary:
        "Kontaktkanalene er ikke i orden: kontaktadressen mangler, private sårbarhetsmeldinger er av.",
    });
  });

  it("count a ruleset that requires the tests as protection", async () => {
    const results = byId(
      await runPilotChecks(
        deps({
          fetch: fakeFetch({
            ...healthy,
            "/branches/main": { name: "main", commit: { sha } },
            "/rules/branches/main": [
              { type: "pull_request" },
              { type: "required_status_checks" },
            ],
          }),
        }),
      ),
    );

    expect(results["protected-flow"]!.status).toBe("passed");
  });

  it("say so when GitHub will not answer, and when this is not production", async () => {
    const limited = byId(
      await runPilotChecks(deps({ fetch: fakeFetch(healthy, 403) })),
    );

    expect(limited["protected-flow"]).toMatchObject({
      status: "unchecked",
      summary:
        "GitHub tar ikke imot flere spørsmål akkurat nå. Prøv igjen om en stund.",
    });

    const local = byId(await runPilotChecks(deps({ env: {} })));

    for (const id of ["ci", "deploy", "protected-flow", "restore-drill"]) {
      expect(local[id], id).toMatchObject({
        status: "unchecked",
        summary:
          "Kontrolleres bare i den publiserte appen, ikke i et test- eller utviklingsmiljø.",
      });
    }

    const preview = byId(
      await runPilotChecks(
        deps({ env: { ...published, VERCEL_ENV: "preview" } }),
      ),
    );
    expect(preview.deploy!.status).toBe("failed");
  });

  it("leave the sign-in check unchecked when the provider does not answer", async () => {
    const results = byId(
      await runPilotChecks(
        deps({
          newAccountsOpen: () => Promise.reject(new Error("unavailable")),
        }),
      ),
    );

    expect(results["signup-closed"]).toMatchObject({
      status: "unchecked",
      summary:
        "Fikk ikke svar fra innloggingstjenesten. Prøv igjen om en stund.",
    });
  });
});
