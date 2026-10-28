import { newAccountsOpen } from "@lanbort/auth";
import type { PilotCheckResult, PilotCheckStatus } from "@lanbort/contracts";
import {
  checkNotificationEmail,
  checkPilotJournalPrivacy,
  checkPilotMigrations,
  type DomainContext,
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
  /** Whether notification e-mail is set up here. */
  readonly emailConfigured: boolean;
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
          checks?: unknown[];
        };
      };
    }>(`/branches/${encodeURIComponent(name)}`),
  );

  return { repository, branch };
}

type Facts = ReturnType<typeof gitHubFacts>;

const okConclusions = new Set(["success", "skipped", "neutral"]);

async function ciCheck(
  repository: GitHubRepository,
  get: GitHubGet,
  sha: string | undefined,
) {
  if (!sha) return onlyPublished("ci");

  const { check_runs: all } = await get<{
    check_runs: {
      name: string;
      status: string;
      conclusion: string | null;
      app: { slug: string } | null;
    }[];
  }>(`/commits/${sha}/check-runs?per_page=100`);
  const runs = all.filter((run) => run.app?.slug === "github-actions");
  const details = [
    `Versjon ${short(sha)}.`,
    ...runs.map(
      (run) =>
        `${run.name}: ${run.status === "completed" ? run.conclusion : run.status}`,
    ),
  ];
  const links = [
    {
      label: "Testkjøringene på GitHub",
      href: gitHubPage(repository, `/commit/${sha}/checks`),
    },
  ];
  const failed = runs.filter(
    (run) =>
      run.status === "completed" && !okConclusions.has(run.conclusion ?? ""),
  );

  if (runs.length === 0) {
    return check(
      "ci",
      "unchecked",
      "Fant ingen testkjøringer for versjonen som er publisert.",
      details,
      links,
    );
  }

  if (failed.length > 0) {
    return check(
      "ci",
      "failed",
      `${failed.length} av ${runs.length} testkjøringer feilet for versjonen som er publisert.`,
      details,
      links,
    );
  }

  return runs.some((run) => run.status !== "completed")
    ? check(
        "ci",
        "unchecked",
        "Testene kjører fortsatt. Kontroller igjen når de er ferdige.",
        details,
        links,
      )
    : check(
        "ci",
        "passed",
        `Alle ${runs.length} testkjøringene er grønne for versjonen som er publisert.`,
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
  const rules = await get<{ type: string }[]>(
    `/rules/branches/${encodeURIComponent(branch.name)}`,
  );
  const required = branch.protection?.required_status_checks;
  const byProtection =
    required !== undefined &&
    required.enforcement_level !== "off" &&
    ((required.contexts?.length ?? 0) > 0 ||
      (required.checks?.length ?? 0) > 0);
  const byRuleset = rules.some(
    (rule) => rule.type === "required_status_checks",
  );
  const details = [
    `Grenbeskyttelse med påkrevde tester på ${branch.name}: ${byProtection ? "ja" : "nei"}.`,
    `Regelsett med påkrevde tester: ${byRuleset ? "ja" : "nei"}.`,
    `Regler som gjelder grenen: ${rules.map((rule) => rule.type).join(", ") || "ingen"}.`,
  ];
  const links = [
    {
      label: "Innstillinger for grener på GitHub",
      href: gitHubPage(repository, "/settings/branches"),
    },
  ];

  return byProtection || byRuleset
    ? check(
        "protected-flow",
        "passed",
        `${branch.name} krever grønne tester før noe slås sammen.`,
        details,
        links,
      )
    : check(
        "protected-flow",
        "failed",
        `${branch.name} er ikke beskyttet: en endring kan slås sammen og publiseres uten grønne tester.`,
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
      checkNotificationEmail(db, deps.now, deps.emailConfigured),
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
) {
  const env = serverEnv();

  return runPilotChecks({
    domain,
    now: new Date(),
    env: process.env,
    fetch,
    migrations: builtMigrations(),
    origin: env.APP_URL ?? origin,
    emailConfigured: notificationEmailServices() !== undefined,
    newAccountsOpen: () =>
      newAccountsOpen({
        url: env.SUPABASE_URL,
        publishableKey: env.SUPABASE_PUBLISHABLE_KEY,
      }),
  });
}
