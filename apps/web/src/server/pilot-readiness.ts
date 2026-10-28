import { newAccountsOpen } from "@lanbort/auth";
import {
  type PilotCheckResult,
  type PilotCheckStatus,
  pilotRequiredChecks,
} from "@lanbort/contracts";
import {
  checkNotificationEmail,
  checkPilotJournalPrivacy,
  checkPilotMigrations,
  type DomainContext,
  type PilotTestEmail,
} from "@lanbort/domain";
import { serverEnv } from "./env";
import {
  type GitHubGet,
  type GitHubRepository,
  GitHubUnavailableError,
  deployedRepository,
  gitHubPage,
  gitHubReader,
} from "./github";
import { notificationEmailServices } from "./notification-emails";

/**
 * The automatic checks of the pilot's readiness checklist
 * (`pilotRequirements`, pilot-ui.md «Gjennomføring per fase»), run by the
 * server against this deployment, its database and the services around
 * it, when the lead asks. Each says what it found in plain words, with the
 * technical details and sources behind it. A check that cannot run says
 * so and why; it never passes for want of an answer.
 */

type Env = Readonly<Record<string, string | undefined>>;

export interface PilotCheckDeps {
  readonly domain: Pick<DomainContext, "db">;
  readonly now: Date;
  readonly env: Env;
  readonly fetch: typeof fetch;
  /** The migrations this build was made with (`LANBORT_MIGRATIONS`). */
  readonly migrations: readonly string[];
  /** Where this deployment serves its pages, for its own security.txt. */
  readonly origin: string;
  /**
   * Notification e-mail as set up here, sending the e-mail check's test
   * message to the lead; null when it is not set up.
   */
  readonly email: PilotTestEmail | null;
  /** Whether the auth provider lets new addresses make an account. */
  readonly newAccountsOpen: () => Promise<boolean>;
}

const day = 24 * 60 * 60 * 1000;

const check = (
  requirementId: string,
  status: PilotCheckStatus,
  summary: string,
  details: readonly string[] = [],
  links: PilotCheckResult["links"] = [],
): PilotCheckResult => ({
  requirementId,
  status,
  summary,
  details: details.map((line) => line.slice(0, 250)).slice(0, 12),
  links: [...links].slice(0, 6),
});

/**
 * What a check that could not finish says: that its source did not answer,
 * or that the answer was not what it expected.
 */
function unfinished(requirementId: string, error: unknown, source: string) {
  return check(
    requirementId,
    "unchecked",
    !(error instanceof GitHubUnavailableError) && source !== "GitHub"
      ? `Fikk ikke svar fra ${source}. Prøv igjen om en stund.`
      : error instanceof GitHubUnavailableError
        ? error.reason === "limited"
          ? "GitHub tar ikke imot flere spørsmål akkurat nå. Prøv igjen om en stund."
          : "Fikk ikke svar fra GitHub. Prøv igjen om en stund."
        : "Svaret fra GitHub var ikke som ventet, så kontrollen ble ikke fullført.",
  );
}

/** A check that throws ends unchecked, and the others are not affected. */
const guarded = (
  requirementId: string,
  source: string,
  run: () => Promise<PilotCheckResult>,
) => run().catch((error: unknown) => unfinished(requirementId, error, source));

const onlyPublished = (requirementId: string) =>
  check(
    requirementId,
    "unchecked",
    "Kontrolleres bare i den publiserte appen, ikke i et test- eller utviklingsmiljø.",
  );

const short = (sha: string) => sha.slice(0, 7);

/** What GitHub says about the repository, each asked for once. */
function gitHubFacts(get: GitHubGet) {
  const repository = get<{ default_branch: string }>("");
  const branch = repository.then(({ default_branch: name }) =>
    get<{
      name: string;
      commit: { sha: string };
      protection?: {
        required_status_checks?: {
          enforcement_level?: string;
          contexts?: string[];
          checks?: { context: string }[];
        };
      };
    }>(`/branches/${encodeURIComponent(name)}`),
  );

  return { repository, branch };
}

type Facts = ReturnType<typeof gitHubFacts>;

const requiredText = pilotRequiredChecks.join(", ");

async function ciCheck(
  repository: GitHubRepository,
  get: GitHubGet,
  sha: string | undefined,
) {
  if (!sha) return onlyPublished("ci");

  const { check_runs: all } = await get<{
    check_runs: {
      id: number;
      name: string;
      status: string;
      conclusion: string | null;
      app: { slug: string } | null;
    }[];
  }>(`/commits/${sha}/check-runs?per_page=100`);
  // The newest run of each required job on exactly this commit.
  const runs = pilotRequiredChecks.map((name) =>
    all
      .filter((run) => run.app?.slug === "github-actions" && run.name === name)
      .reduce<(typeof all)[number] | undefined>(
        (newest, run) => (newest && newest.id > run.id ? newest : run),
        undefined,
      ),
  );
  const outcomes = pilotRequiredChecks.map((name, index) => {
    const run = runs[index];

    return {
      name,
      state: !run
        ? "missing"
        : run.status !== "completed"
          ? "running"
          : run.conclusion === "success"
            ? "passed"
            : "failed",
      shown: !run
        ? "ikke kjørt"
        : run.status === "completed"
          ? (run.conclusion ?? "ukjent")
          : run.status,
    };
  });
  const details = [
    `Versjon ${short(sha)}.`,
    ...outcomes.map(({ name, shown }) => `${name}: ${shown}`),
  ];
  const links = [
    {
      label: "Testkjøringene på GitHub",
      href: gitHubPage(repository, `/commit/${sha}/checks`),
    },
  ];
  const named = (state: string) =>
    outcomes
      .filter((outcome) => outcome.state === state)
      .map(({ name }) => name);
  const failed = named("failed");
  const running = named("running");
  const missing = named("missing");
  const total = pilotRequiredChecks.length;

  // Only a job that ran to the end and succeeded counts: one that was
  // skipped, cancelled or never ran is no test of this version.
  if (failed.length > 0) {
    return check(
      "ci",
      "failed",
      `${failed.length} av ${total} testjobber er ikke bestått for versjonen som er publisert: ${failed.join(", ")}.`,
      details,
      links,
    );
  }

  if (running.length > 0) {
    return check(
      "ci",
      "unchecked",
      "Testene kjører fortsatt. Kontroller igjen når de er ferdige.",
      details,
      links,
    );
  }

  return missing.length > 0
    ? check(
        "ci",
        "failed",
        `${missing.length} av ${total} testjobber ble ikke kjørt for versjonen som er publisert: ${missing.join(", ")}.`,
        details,
        links,
      )
    : check(
        "ci",
        "passed",
        `Alle ${total} testjobbene (${requiredText}) er grønne for versjonen som er publisert.`,
        details,
        links,
      );
}

async function deployCheck(
  repository: GitHubRepository,
  facts: Facts,
  env: Env,
) {
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  if (!sha) return onlyPublished("deploy");

  const branch = await facts.branch;
  const details = [
    `Publisert: ${short(sha)} fra ${env.VERCEL_GIT_COMMIT_REF ?? "ukjent gren"}.`,
    `Nyeste på ${branch.name}: ${short(branch.commit.sha)}.`,
  ];
  const links = [
    {
      label: "Den publiserte versjonen",
      href: gitHubPage(repository, `/commit/${sha}`),
    },
  ];

  return branch.commit.sha === sha
    ? check(
        "deploy",
        "passed",
        `Produksjonen kjører den nyeste versjonen av ${branch.name}.`,
        details,
        links,
      )
    : check(
        "deploy",
        "failed",
        `Produksjonen kjører ikke den nyeste versjonen av ${branch.name}. Den nyeste er kanskje ikke publisert ennå.`,
        details,
        links,
      );
}

async function protectedFlowCheck(
  repository: GitHubRepository,
  get: GitHubGet,
  facts: Facts,
) {
  const branch = await facts.branch;
  const rules = await get<
    {
      type: string;
      ruleset_id?: number;
      parameters?: { required_status_checks?: { context: string }[] };
    }[]
  >(`/rules/branches/${encodeURIComponent(branch.name)}`);

  // Branch protection binds everyone, administrators too, only when its
  // enforcement level says so; otherwise an administrator can go around it.
  const required = branch.protection?.required_status_checks;
  const protectionChecks = new Set([
    ...(required?.contexts ?? []),
    ...(required?.checks ?? []).map((each) => each.context),
  ]);
  const protectionBinds = required?.enforcement_level === "everyone";

  // A ruleset binds everyone when nobody is on its bypass list. GitHub
  // only shows that list to those who may change the ruleset.
  const statusRules = rules.filter(
    (rule) => rule.type === "required_status_checks",
  );
  const rulesets = await Promise.all(
    [...new Set(statusRules.map((rule) => rule.ruleset_id))].map(async (id) => {
      const ruleset =
        id === undefined
          ? undefined
          : await get<{ name?: string; bypass_actors?: unknown[] }>(
              `/rulesets/${id}`,
            ).catch(() => undefined);

      return {
        id,
        name: ruleset?.name ?? `regelsett ${id ?? "uten nummer"}`,
        bypass: ruleset?.bypass_actors,
        checks: new Set(
          statusRules
            .filter((rule) => rule.ruleset_id === id)
            .flatMap(
              (rule) =>
                rule.parameters?.required_status_checks?.map(
                  (each) => each.context,
                ) ?? [],
            ),
        ),
      };
    }),
  );

  const standing = pilotRequiredChecks.map((name) => {
    const inRulesets = rulesets.filter((each) => each.checks.has(name));

    return {
      name,
      bound:
        (protectionBinds && protectionChecks.has(name)) ||
        inRulesets.some((each) => each.bypass?.length === 0),
      unknown: inRulesets.some((each) => each.bypass === undefined),
      required: protectionChecks.has(name) || inRulesets.length > 0,
    };
  });

  const details = [
    `Grenbeskyttelse på ${branch.name}: ${
      required
        ? `krever ${[...protectionChecks].join(", ") || "ingen tester"}, gjelder ${protectionBinds ? "alle, også administratorer" : "ikke administratorer"}`
        : "ingen krav om tester"
    }.`,
    ...rulesets.map(
      (each) =>
        `Regelsett «${each.name}»: krever ${[...each.checks].join(", ") || "ingen tester"}; ${
          each.bypass === undefined
            ? "kan ikke se hvem som kan gå utenom det"
            : each.bypass.length === 0
              ? "ingen kan gå utenom det"
              : `${each.bypass.length} kan gå utenom det`
        }.`,
    ),
    ...standing.map(
      ({ name, bound, required: isRequired }) =>
        `${name}: ${bound ? "påkrevd for alle" : isRequired ? "påkrevd, men noen kan gå utenom" : "ikke påkrevd"}.`,
    ),
  ];
  const links = [
    {
      label: "Innstillinger for grener på GitHub",
      href: gitHubPage(repository, "/settings/branches"),
    },
  ];
  const loose = standing.filter((each) => !each.bound);

  if (loose.length === 0) {
    return check(
      "protected-flow",
      "passed",
      `${branch.name} krever at alle ${pilotRequiredChecks.length} testjobbene er grønne før noe slås sammen, og ingen kan gå utenom det.`,
      details,
      links,
    );
  }

  // What is required, but only through a ruleset whose bypass list could
  // not be seen, is neither shown to hold nor to fail.
  return loose.every((each) => each.required && each.unknown)
    ? check(
        "protected-flow",
        "unchecked",
        "GitHub viser ikke hvem som kan gå utenom regelsettet uten lesetilgang til innstillingene.",
        details,
        links,
      )
    : check(
        "protected-flow",
        "failed",
        `${branch.name} slipper gjennom endringer uten grønne tester: ${loose.map(({ name }) => name).join(", ")} er ikke påkrevd for alle.`,
        details,
        links,
      );
}

/** The drill must be newer than this to count (it runs every month). */
const drillMaxAgeMs = 40 * day;

async function restoreDrillCheck(
  repository: GitHubRepository,
  get: GitHubGet,
  facts: Facts,
  now: Date,
) {
  const { default_branch: branch } = await facts.repository;
  const { workflow_runs: runs } = await get<{
    workflow_runs: {
      conclusion: string | null;
      updated_at: string;
      html_url: string;
    }[];
  }>(
    `/actions/workflows/restore-drill.yml/runs?branch=${encodeURIComponent(branch)}&status=completed&per_page=1`,
  );
  const last = runs[0];
  const links = [
    {
      label: "Gjenopprettingsøvelsene på GitHub",
      href: gitHubPage(repository, "/actions/workflows/restore-drill.yml"),
    },
  ];

  if (!last) {
    return check(
      "restore-drill",
      "failed",
      "Gjenopprettingsøvelsen har ikke kjørt.",
      [],
      links,
    );
  }

  const details = [
    `Siste øvelse: ${last.updated_at}, ${last.conclusion ?? "uten resultat"}.`,
  ];
  const age = now.getTime() - new Date(last.updated_at).getTime();

  if (last.conclusion !== "success") {
    return check(
      "restore-drill",
      "failed",
      "Den siste gjenopprettingsøvelsen feilet.",
      details,
      [{ label: "Den siste øvelsen", href: last.html_url }, ...links],
    );
  }

  return age > drillMaxAgeMs
    ? check(
        "restore-drill",
        "failed",
        `Den siste vellykkede øvelsen er ${Math.floor(age / day)} dager gammel.`,
        details,
        links,
      )
    : check(
        "restore-drill",
        "passed",
        `Gjenopprettingen ble øvd for ${Math.floor(age / day)} dager siden, og øvelsen var vellykket.`,
        details,
        [{ label: "Den siste øvelsen", href: last.html_url }, ...links],
      );
}

async function signupClosedCheck(deps: PilotCheckDeps) {
  try {
    return (await deps.newAccountsOpen())
      ? check(
          "signup-closed",
          "failed",
          "Hvem som helst kan lage konto: ny registrering er slått på.",
          ["Innloggingstjenesten (Supabase Auth): disable_signup = false."],
        )
      : check(
          "signup-closed",
          "passed",
          "Ny registrering er slått av. Bare inviterte kommer inn.",
          ["Innloggingstjenesten (Supabase Auth): disable_signup = true."],
        );
  } catch (error) {
    return unfinished("signup-closed", error, "innloggingstjenesten");
  }
}

/** security.txt must stay valid this long into the pilot. */
const securityTxtMarginMs = 30 * day;

async function contactCheck(
  deps: PilotCheckDeps,
  repository: GitHubRepository | null,
  get: GitHubGet | null,
) {
  const { env, now } = deps;
  const problems: string[] = [];
  const details: string[] = [
    `Ansvarlig (OPERATOR_NAME): ${env.OPERATOR_NAME ? "satt" : "mangler"}.`,
    `Kontaktadresse (CONTACT_EMAIL): ${env.CONTACT_EMAIL ? "satt" : "mangler"}.`,
  ];

  if (!env.OPERATOR_NAME) problems.push("navnet på den ansvarlige mangler");
  if (!env.CONTACT_EMAIL) problems.push("kontaktadressen mangler");

  const securityTxt = new URL("/.well-known/security.txt", deps.origin);
  let expires: Date | null = null;

  try {
    const response = await deps.fetch(securityTxt, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const text = response.ok ? await response.text() : "";
    const value = /^Expires:\s*(\S+)/im.exec(text)?.[1];
    expires = value ? new Date(value) : null;
  } catch {
    // Said below: it could not be read.
  }

  if (!expires || Number.isNaN(expires.getTime())) {
    details.push(`${securityTxt.href}: kunne ikke leses.`);
    problems.push("security.txt kunne ikke leses");
  } else {
    details.push(`security.txt utløper ${expires.toISOString()}.`);
    if (expires.getTime() - now.getTime() < securityTxtMarginMs) {
      problems.push("security.txt utløper innen 30 dager");
    }
  }

  // Without GitHub's answer the requirement is not shown as passed.
  let unverified: string | null = null;

  if (repository && get) {
    try {
      const { enabled } = await get<{ enabled: boolean }>(
        "/private-vulnerability-reporting",
      );
      details.push(
        `Private sårbarhetsmeldinger på GitHub: ${enabled ? "på" : "av"}.`,
      );
      if (!enabled) problems.push("private sårbarhetsmeldinger er av");
    } catch (error) {
      unverified = unfinished("contact", error, "GitHub").summary;
      details.push("Private sårbarhetsmeldinger på GitHub: fikk ikke svar.");
    }
  } else {
    unverified = onlyPublished("contact").summary;
  }

  const links = [
    { label: "security.txt", href: securityTxt.href },
    ...(repository
      ? [
          {
            label: "Sikkerhetsinnstillinger på GitHub",
            href: gitHubPage(repository, "/settings/security_analysis"),
          },
        ]
      : []),
  ].filter((link) => link.href.startsWith("https://"));

  return problems.length > 0
    ? check(
        "contact",
        "failed",
        `Kontaktkanalene er ikke i orden: ${problems.join(", ")}.`,
        details,
        links,
      )
    : unverified
      ? check("contact", "unchecked", unverified, details, links)
      : check(
          "contact",
          "passed",
          "Kontaktadressen og den ansvarlige er satt, security.txt er gyldig, og private sårbarhetsmeldinger er på.",
          details,
          links,
        );
}

/**
 * Runs every automatic check, each on its own: one that fails to run
 * leaves the others as they are.
 */
export async function runPilotChecks(
  deps: PilotCheckDeps,
): Promise<PilotCheckResult[]> {
  // Only production is what participants use: a preview is never checked.
  const repository =
    deps.env.VERCEL_ENV === "production" ? deployedRepository(deps.env) : null;
  const get = repository
    ? gitHubReader(repository, {
        fetch: deps.fetch,
        token: deps.env.GITHUB_READ_TOKEN,
      })
    : null;
  const facts = get ? gitHubFacts(get) : null;
  // Asked for once, and answered by each check that needs them.
  void facts?.repository.catch(() => undefined);
  void facts?.branch.catch(() => undefined);

  const fromGitHub = (
    requirementId: string,
    run: (
      repository: GitHubRepository,
      get: GitHubGet,
      facts: Facts,
    ) => Promise<PilotCheckResult>,
  ) =>
    repository && get && facts
      ? guarded(requirementId, "GitHub", () => run(repository, get, facts))
      : Promise.resolve(onlyPublished(requirementId));

  const { db } = deps.domain;

  return Promise.all([
    fromGitHub("ci", (repo, read) =>
      ciCheck(repo, read, deps.env.VERCEL_GIT_COMMIT_SHA),
    ),
    fromGitHub("deploy", (repo, _read, known) =>
      deployCheck(repo, known, deps.env),
    ),
    fromGitHub("protected-flow", protectedFlowCheck),
    guarded("migrations", "databasen", () =>
      checkPilotMigrations(db, deps.migrations),
    ),
    guarded("email", "databasen", () =>
      checkNotificationEmail(db, deps.now, deps.email),
    ),
    fromGitHub("restore-drill", (repo, read, known) =>
      restoreDrillCheck(repo, read, known, deps.now),
    ),
    signupClosedCheck(deps),
    guarded("journal-private", "databasen", () => checkPilotJournalPrivacy(db)),
    guarded("contact", "nettstedet", () => contactCheck(deps, repository, get)),
  ]);
}

/**
 * The migrations this build was made with: `next.config.ts` reads them
 * from `supabase/migrations` when the app is built.
 */
export const builtMigrations = (): string[] =>
  (process.env.LANBORT_MIGRATIONS ?? "").split(",").filter(Boolean);

/** The checks as this deployment runs them, for the route. */
export function runtimePilotChecks(
  domain: Pick<DomainContext, "db">,
  origin: string,
  leadId: string,
) {
  const env = serverEnv();
  const email = notificationEmailServices();

  return runPilotChecks({
    domain,
    now: new Date(),
    env: process.env,
    fetch,
    migrations: builtMigrations(),
    origin: env.APP_URL ?? origin,
    email: email ? { sender: email.sender, recipientId: leadId } : null,
    newAccountsOpen: () =>
      newAccountsOpen({
        url: env.SUPABASE_URL,
        publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      }),
  });
}
