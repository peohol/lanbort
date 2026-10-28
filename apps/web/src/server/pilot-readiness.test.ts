import { readFileSync } from "node:fs";
import { type PilotCheckResult, pilotRequiredChecks } from "@lanbort/contracts";
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

let runIds = 0;

/** A GitHub Actions job's run on the published commit. */
const run = (
  name: string,
  conclusion: string | null = "success",
  status = "completed",
) => ({
  id: (runIds += 1),
  name,
  status,
  conclusion,
  app: { slug: "github-actions" },
});

const ciAnswer = (...runs: ReturnType<typeof run>[]) => ({
  [`/commits/${sha}/check-runs?per_page=100`]: { check_runs: runs },
});

/** GitHub and the site as a healthy, protected repository answers. */
const healthy: Answers = {
  "": { default_branch: "main" },
  "/branches/main": {
    name: "main",
    commit: { sha },
    protection: {
      required_status_checks: {
        enforcement_level: "everyone",
        contexts: ["quality", "database", "e2e", "security"],
      },
    },
  },
  "/rules/branches/main": [],
  [`/commits/${sha}/check-runs?per_page=100`]: {
    check_runs: ["quality", "database", "e2e", "security"].map((name) =>
      run(name),
    ),
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
  email: null,
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
      "Alle 4 testjobbene (quality, database, e2e, security) er grønne for versjonen som er publisert.",
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
            ...ciAnswer(run("e2e", "failure")),
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
      summary:
        "1 av 4 testjobber er ikke bestått for versjonen som er publisert: e2e.",
      details: [
        `Versjon ${sha.slice(0, 7)}.`,
        "quality: ikke kjørt",
        "database: ikke kjørt",
        "e2e: failure",
        "security: ikke kjørt",
      ],
    });
    expect(results.deploy!.status).toBe("failed");
    expect(results["protected-flow"]).toMatchObject({
      status: "failed",
      summary:
        "main slipper gjennom endringer uten grønne tester: quality, database, e2e, security er ikke påkrevd for alle.",
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

  it("pass CI only when every required job ran to success on that commit", async () => {
    const ciWith = async (...runs: ReturnType<typeof run>[]) =>
      byId(
        await runPilotChecks(
          deps({ fetch: fakeFetch({ ...healthy, ...ciAnswer(...runs) }) }),
        ),
      ).ci!;
    const others = ["quality", "database", "e2e"].map((name) => run(name));

    // A job that was skipped, or never ran, is no test of this version.
    expect(await ciWith(...others, run("security", "skipped"))).toMatchObject({
      status: "failed",
      summary:
        "1 av 4 testjobber er ikke bestått for versjonen som er publisert: security.",
    });
    expect(await ciWith(...others, run("security", "neutral"))).toMatchObject({
      status: "failed",
    });
    expect(await ciWith(...others)).toMatchObject({
      status: "failed",
      summary:
        "1 av 4 testjobber ble ikke kjørt for versjonen som er publisert: security.",
    });
    expect(
      await ciWith(...others, run("security", null, "in_progress")),
    ).toMatchObject({
      status: "unchecked",
      summary: "Testene kjører fortsatt. Kontroller igjen når de er ferdige.",
    });
    // A job from another app with the same name does not stand in for it.
    expect(
      await ciWith(...others, { ...run("security"), app: { slug: "other" } }),
    ).toMatchObject({ status: "failed" });
    // The newest run of a job counts: a re-run that passed replaces a failure.
    expect(
      await ciWith(...others, run("security", "failure"), run("security")),
    ).toMatchObject({ status: "passed" });
  });

  it("pass protection only when main requires every job of everyone", async () => {
    const protectedBy = async (answers: Answers) =>
      byId(
        await runPilotChecks(
          deps({ fetch: fakeFetch({ ...healthy, ...answers }) }),
        ),
      )["protected-flow"]!;
    const protection = (
      contexts: string[],
      enforcement_level = "everyone",
    ) => ({
      "/branches/main": {
        name: "main",
        commit: { sha },
        protection: {
          required_status_checks: { enforcement_level, contexts },
        },
      },
    });
    const all = ["quality", "database", "e2e", "security"];

    // One required test is not all of them.
    expect(await protectedBy(protection(["quality"]))).toMatchObject({
      status: "failed",
      summary:
        "main slipper gjennom endringer uten grønne tester: database, e2e, security er ikke påkrevd for alle.",
    });
    // Administrators may go around protection that is not for everyone.
    expect(await protectedBy(protection(all, "non_admins"))).toMatchObject({
      status: "failed",
    });
    expect(
      await protectedBy({
        "/branches/main": {
          name: "main",
          commit: { sha },
          protection: {
            required_status_checks: {
              enforcement_level: "everyone",
              checks: all.map((context) => ({ context, app_id: 15368 })),
            },
          },
        },
      }),
    ).toMatchObject({ status: "passed" });

    // A ruleset counts when nobody may go around it, which GitHub only
    // shows to those who may change it.
    const ruleset = (bypass?: unknown[]) => ({
      "/branches/main": { name: "main", commit: { sha } },
      "/rules/branches/main": [
        { type: "pull_request", ruleset_id: 7 },
        {
          type: "required_status_checks",
          ruleset_id: 7,
          parameters: {
            required_status_checks: all.map((context) => ({ context })),
          },
        },
      ],
      "/rulesets/7": {
        name: "Krev grønne tester",
        ...(bypass ? { bypass_actors: bypass } : {}),
      },
    });

    expect(await protectedBy(ruleset([]))).toMatchObject({
      status: "passed",
    });
    expect(await protectedBy(ruleset())).toMatchObject({
      status: "unchecked",
      summary:
        "GitHub viser ikke hvem som kan gå utenom regelsettet uten lesetilgang til innstillingene.",
    });
    expect(
      await protectedBy(ruleset([{ actor_type: "RepositoryRole" }])),
    ).toMatchObject({ status: "failed" });
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

    // A preview has the repository's variables too, but is never checked.
    const preview = byId(
      await runPilotChecks(
        deps({ env: { ...published, VERCEL_ENV: "preview" } }),
      ),
    );
    for (const id of [
      "ci",
      "deploy",
      "protected-flow",
      "restore-drill",
      "contact",
    ]) {
      expect(preview[id], id).toMatchObject({
        status: "unchecked",
        summary:
          "Kontrolleres bare i den publiserte appen, ikke i et test- eller utviklingsmiljø.",
      });
    }
  });

  it("leave the contact channels unchecked when GitHub will not say if private reports are on", async () => {
    const withoutAnswer = Object.fromEntries(
      Object.entries(healthy).filter(
        ([path]) => path !== "/private-vulnerability-reporting",
      ),
    );
    const results = byId(
      await runPilotChecks(deps({ fetch: fakeFetch(withoutAnswer) })),
    );

    expect(results.contact).toMatchObject({
      status: "unchecked",
      summary: "Fikk ikke svar fra GitHub. Prøv igjen om en stund.",
    });
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

describe("the tests every version must pass", () => {
  it("are the jobs of the CI workflow, all of them", () => {
    const workflow = readFileSync(
      new URL("../../../../.github/workflows/ci.yml", import.meta.url),
      "utf8",
    );
    const jobs = [
      ...workflow
        .slice(workflow.indexOf("\njobs:\n"))
        .matchAll(/^ {2}([a-z0-9_-]+):\s*$/gm),
    ].map(([, name]) => name);

    expect([...pilotRequiredChecks].sort()).toEqual(jobs.sort());
  });
});
