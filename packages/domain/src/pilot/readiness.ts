import {
  type PilotCheckLink,
  type PilotCheckResult,
  type PilotCheckStatus,
  type PilotDefect,
  type PilotGate,
  type PilotReadiness,
  type PilotRequirement,
  type PilotRequirementStanding,
  type PilotTestSummary,
  pilotCheckFreshMs,
  pilotPhases,
  pilotRequirementsOf,
} from "@lanbort/contracts";
import type { Database } from "@lanbort/database";
import { type Kysely, sql } from "kysely";
import { loadDefects, loadStandings, unresolvedDefect } from "./journal";
import { blockingSeverities } from "./model";

type Db = Kysely<Database>;

/** The newest automatic check of a requirement, as the journal keeps it. */
export interface PilotCheckRecord {
  readonly requirementId: string;
  readonly status: PilotCheckStatus;
  readonly summary: string;
  readonly details: readonly string[];
  readonly links: readonly PilotCheckLink[];
  readonly at: Date;
  readonly by: string | null;
}

/** The newest confirmation of a manual requirement, or its withdrawal. */
export interface PilotConfirmationRecord {
  readonly requirementId: string;
  readonly confirmed: boolean;
  readonly note: string | null;
  readonly at: Date;
  readonly by: string | null;
}

/** What the journal itself says about a phase: its tests and defects. */
export interface PilotJournalState {
  readonly gate: PilotGate;
  readonly tests: readonly PilotTestSummary[];
  readonly defects: readonly PilotDefect[];
}

const nothing: Omit<PilotRequirementStanding, "id" | "status"> = {
  summary: null,
  details: [],
  links: [],
  at: null,
  by: null,
  note: null,
  stale: false,
};

const testLine = (test: PilotTestSummary, standing: string) =>
  `${test.id} ${test.action}: ${standing}`;

/** The phase's tests, from the gate: viewed as one requirement. */
function phaseTests(
  journal: PilotJournalState,
): Omit<PilotRequirementStanding, "id"> {
  const { gate, tests } = journal;
  const due = tests.filter((test) => test.phase <= gate.phase);
  const pending = new Set([...gate.basisNotPassed, ...gate.untried]);
  const failed = due.filter(
    (test) =>
      gate.basisNotPassed.includes(test.id) &&
      (test.status === "failed" || test.status === "blocked"),
  );
  const status: PilotCheckStatus =
    failed.length > 0 ? "failed" : pending.size > 0 ? "unchecked" : "passed";

  return {
    ...nothing,
    status,
    summary:
      status === "passed"
        ? `Alle ${due.length} testene har et resultat, og de viktige er bestått.`
        : status === "failed"
          ? `${failed.length} av de viktige testene har feilet eller er blokkert.`
          : `${pending.size} av ${due.length} testene mangler et resultat som teller.`,
    details: due
      .filter((test) => pending.has(test.id))
      .map((test) =>
        testLine(
          test,
          gate.basisNotPassed.includes(test.id)
            ? `viktig, ${test.status === "not_started" ? "ikke startet" : "ikke bestått"}`
            : "ikke prøvd",
        ),
      ),
  };
}

/** Open P0 and P1 defects: the pilot does not go on with them. */
function criticalDefects(
  journal: PilotJournalState,
): Omit<PilotRequirementStanding, "id"> {
  const open = journal.defects.filter(
    (defect) =>
      unresolvedDefect(defect.status) &&
      blockingSeverities.has(defect.severity),
  );

  return {
    ...nothing,
    status: open.length === 0 ? "passed" : "failed",
    summary:
      open.length === 0
        ? "Ingen feil med alvorlighet P0 eller P1 står åpne."
        : `${open.length} alvorlige feil står åpne.`,
    details: open.map(
      (defect) => `F-${defect.number} ${defect.title} (${defect.severity})`,
    ),
  };
}

const journalRequirements: Readonly<
  Record<
    string,
    (journal: PilotJournalState) => Omit<PilotRequirementStanding, "id">
  >
> = {
  "phase-tests": phaseTests,
  "critical-defects": criticalDefects,
};

/**
 * Where each requirement of a phase stands, and whether all of them hold
 * now (pilot-ui.md «Gjennomføring per fase»). An automatic check only
 * counts within `pilotCheckFreshMs` of when it ran; a manual requirement
 * holds while the lead's confirmation of it stands. Nothing passes without
 * a ground that is shown with it.
 */
export function pilotReadiness(
  phase: number,
  journal: PilotJournalState,
  checks: readonly PilotCheckRecord[],
  confirmations: readonly PilotConfirmationRecord[],
  now: Date,
): PilotReadiness {
  const requirements = pilotRequirementsOf(phase).map(
    (requirement): PilotRequirementStanding => ({
      id: requirement.id,
      ...standing(requirement, journal, checks, confirmations, now),
    }),
  );
  const checkedAt = checks
    .map((check) => check.at)
    .reduce<Date | null>(
      (latest, at) => (latest && latest >= at ? latest : at),
      null,
    );

  return {
    phase,
    requirements,
    checkedAt: checkedAt?.toISOString() ?? null,
    ready: requirements.every((requirement) => requirement.status === "passed"),
  };
}

function standing(
  requirement: PilotRequirement,
  journal: PilotJournalState,
  checks: readonly PilotCheckRecord[],
  confirmations: readonly PilotConfirmationRecord[],
  now: Date,
): Omit<PilotRequirementStanding, "id"> {
  switch (requirement.check) {
    case "journal":
      return journalRequirements[requirement.id]!(journal);
    case "manual": {
      const latest = confirmations.find(
        (each) => each.requirementId === requirement.id,
      );

      return latest?.confirmed
        ? {
            ...nothing,
            status: "passed",
            at: latest.at.toISOString(),
            by: latest.by,
            note: latest.note,
          }
        : { ...nothing, status: "needs_confirmation" };
    }
    case "automatic": {
      const latest = checks.find(
        (each) => each.requirementId === requirement.id,
      );

      if (!latest) return { ...nothing, status: "unchecked" };

      const stale =
        latest.status === "passed" &&
        now.getTime() - latest.at.getTime() > pilotCheckFreshMs;

      return {
        status: stale ? "unchecked" : latest.status,
        summary: latest.summary,
        details: [...latest.details],
        links: [...latest.links],
        at: latest.at.toISOString(),
        by: latest.by,
        note: null,
        stale,
      };
    }
  }
}

/** The phases that have a readiness checklist. */
const checklistPhases = pilotPhases
  .map((phase) => phase.number)
  .filter((phase) => pilotRequirementsOf(phase).length > 0);

/**
 * The checklists of the campaign's phases, from its journal. Without a
 * campaign nothing is checked or confirmed, but the journal's own
 * requirements still say where they stand.
 */
export async function loadReadiness(
  db: Db,
  campaignId: string | null,
  journal: Omit<PilotJournalState, "gate"> & { gates: readonly PilotGate[] },
  now: Date,
): Promise<PilotReadiness[]> {
  const [checks, confirmations] = campaignId
    ? await Promise.all([
        db
          .selectFrom("app.pilot_readiness_checks as check")
          .leftJoin(
            "app.profiles as profile",
            "profile.user_id",
            "check.recorded_by",
          )
          .distinctOn("check.requirement_id")
          .select([
            "check.requirement_id",
            "check.status",
            "check.summary",
            "check.details",
            "check.links",
            "check.recorded_at",
            "profile.real_name",
          ])
          .where("check.campaign_id", "=", campaignId)
          .orderBy("check.requirement_id")
          .orderBy("check.recorded_at", "desc")
          .execute(),
        db
          .selectFrom("app.pilot_readiness_confirmations as confirmation")
          .leftJoin(
            "app.profiles as profile",
            "profile.user_id",
            "confirmation.recorded_by",
          )
          .distinctOn("confirmation.requirement_id")
          .select([
            "confirmation.requirement_id",
            "confirmation.confirmed",
            "confirmation.note",
            "confirmation.recorded_at",
            "profile.real_name",
          ])
          .where("confirmation.campaign_id", "=", campaignId)
          .orderBy("confirmation.requirement_id")
          .orderBy("confirmation.recorded_at", "desc")
          .execute(),
      ])
    : [[], []];

  return checklistPhases.map((phase) =>
    pilotReadiness(
      phase,
      { ...journal, gate: journal.gates[phase]! },
      checks.map((row) => ({
        requirementId: row.requirement_id,
        status: row.status as PilotCheckStatus,
        summary: row.summary,
        details: row.details,
        links: row.links as unknown as PilotCheckLink[],
        at: row.recorded_at,
        by: row.real_name,
      })),
      confirmations.map((row) => ({
        requirementId: row.requirement_id,
        confirmed: row.confirmed,
        note: row.note,
        at: row.recorded_at,
        by: row.real_name,
      })),
      now,
    ),
  );
}

/** The campaign's progress and its phases' checklists, as they stand. */
export async function loadCampaignReadiness(
  db: Db,
  campaignId: string,
  now: Date,
) {
  const defects = await loadDefects(db, campaignId);
  const { tests, progress } = await loadStandings(db, campaignId, defects);

  return {
    progress,
    readiness: await loadReadiness(
      db,
      campaignId,
      { tests, defects, gates: progress.gates },
      now,
    ),
  };
}

// The automatic checks that read the database. The server runs them with
// the checks of the deployment's services (apps/web), and records them all
// with `checkPilotReadiness`.

const result = (
  requirementId: string,
  status: PilotCheckStatus,
  summary: string,
  details: readonly string[] = [],
): PilotCheckResult => ({
  requirementId,
  status,
  summary,
  details: [...details].slice(0, 12),
  links: [],
});

const listed = (versions: readonly string[]) =>
  versions.length > 6
    ? `${versions.slice(0, 6).join(", ")} og ${versions.length - 6} til`
    : versions.join(", ");

/**
 * «Databasen er oppdatert»: every migration the running code was built
 * with (`expected`, from `supabase/migrations` at build time) is applied.
 * Migrations the code does not know only show: older code runs on a newer
 * schema while a deploy rolls back.
 */
export async function checkPilotMigrations(
  db: Db,
  expected: readonly string[],
): Promise<PilotCheckResult> {
  if (expected.length === 0) {
    return result(
      "migrations",
      "unchecked",
      "Denne versjonen av appen vet ikke hvilke databaseendringer den ble bygget med.",
    );
  }

  const { rows } = await sql<{ version: string }>`
    select version from supabase_migrations.schema_migrations
  `.execute(db);
  const applied = new Set(rows.map((row) => row.version));
  const missing = expected.filter((version) => !applied.has(version)).sort();
  const unknown = [...applied]
    .filter((version) => !expected.includes(version))
    .sort();
  const details = [
    `Bygget med ${expected.length} databaseendringer; ${applied.size} er kjørt i databasen.`,
    `Nyeste i appen: ${[...expected].sort().at(-1)}.`,
    ...(missing.length > 0 ? [`Mangler i databasen: ${listed(missing)}.`] : []),
    ...(unknown.length > 0
      ? [`Kjørt, men ukjent for denne versjonen: ${listed(unknown)}.`]
      : []),
  ];

  return missing.length === 0
    ? result(
        "migrations",
        "passed",
        "Databasen har alle endringene denne versjonen trenger.",
        details,
      )
    : result(
        "migrations",
        "failed",
        `${missing.length} databaseendringer er ikke kjørt i produksjon.`,
        details,
      );
}

/** The roles a browser can act as through the data API (Supabase). */
const browserRoles = ["anon", "authenticated"] as const;

/**
 * «Pilotjournalen er privat»: no role a browser can use may read or change
 * any of the journal's tables, or reach the schema they are in.
 */
export async function checkPilotJournalPrivacy(
  db: Db,
): Promise<PilotCheckResult> {
  const { rows } = await sql<{
    role: string;
    schema_usage: boolean;
    tables: string[] | null;
    total: number;
  }>`
    select
      role.rolname as role,
      has_schema_privilege(role.oid, 'app', 'USAGE') as schema_usage,
      array_agg(pilot.relname order by pilot.relname) filter (
        where has_table_privilege(
          role.oid, pilot.oid,
          'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
        )
      ) as tables,
      count(pilot.oid)::integer as total
    from pg_roles as role
    cross join pg_class as pilot
    join pg_namespace as schema on schema.oid = pilot.relnamespace
    where role.rolname in (${sql.join(browserRoles.map((role) => sql.lit(role)))})
      and schema.nspname = 'app'
      and pilot.relkind in ('r', 'v', 'm', 'p')
      and pilot.relname like 'pilot\\_%'
    group by role.rolname, role.oid
    order by role.rolname
  `.execute(db);
  const exposed = rows.filter((row) => row.schema_usage || row.tables);
  const total = rows[0]?.total ?? 0;
  const details = [
    `${total} tabeller i pilotjournalen kontrollert for rollene ${browserRoles.join(" og ")}.`,
    ...rows.map((row) =>
      row.schema_usage || row.tables
        ? `${row.role}: ${row.schema_usage ? "når skjemaet app" : ""}${row.tables ? ` har tilgang til ${listed(row.tables)}` : ""}`.trim()
        : `${row.role}: ingen tilgang`,
    ),
  ];

  if (rows.length === 0 || total === 0) {
    return result(
      "journal-private",
      "unchecked",
      "Fant ikke pilotjournalens tabeller eller nettleserens roller i databasen.",
      details,
    );
  }

  return exposed.length === 0
    ? result(
        "journal-private",
        "passed",
        "Ingen roller nettleseren kan bruke, når pilotjournalen.",
        details,
      )
    : result(
        "journal-private",
        "failed",
        "Pilotjournalen kan nås av en rolle som nettleseren kan bruke.",
        details,
      );
}

const hour = 60 * 60 * 1000;
const week = 7 * 24 * hour;

/**
 * «Varsler på e-post blir sendt»: e-mail is set up in this deployment
 * (`configured`), no delivery has waited over an hour (the e-mail job
 * runs), and none was refused or given up in the last week.
 */
export async function checkNotificationEmail(
  db: Db,
  now: Date,
  configured: boolean,
): Promise<PilotCheckResult> {
  const since = new Date(now.getTime() - week);
  const counts = await db
    .selectFrom("app.notification_deliveries")
    .select(({ fn }) => [
      fn
        .countAll<string>()
        .filterWhere("status", "=", "sent")
        .filterWhere("finished_at", ">=", since)
        .filterWhere("finished_at", "<=", now)
        .as("sent"),
      fn
        .countAll<string>()
        .filterWhere("status", "=", "dead")
        .filterWhere("finished_at", ">=", since)
        .filterWhere("finished_at", "<=", now)
        .as("dead"),
      fn
        .countAll<string>()
        .filterWhere("status", "=", "pending")
        .filterWhere("available_at", "<", new Date(now.getTime() - hour))
        .as("stuck"),
    ])
    .executeTakeFirstOrThrow();
  const sent = Number(counts.sent);
  const dead = Number(counts.dead);
  const stuck = Number(counts.stuck);
  const details = [
    configured
      ? "E-postutsendingen er satt opp (nøkkel, avsender og adresse for lenker)."
      : "E-postutsendingen mangler oppsett: RESEND_API_KEY, NOTIFICATION_EMAIL_FROM eller APP_URL.",
    `Siste sju dager: ${sent} sendt, ${dead} avvist eller gitt opp.`,
    `Har ventet i køen i over en time: ${stuck}.`,
  ];

  if (!configured) {
    return result(
      "email",
      "failed",
      "E-postvarsler er ikke satt opp i denne versjonen av appen.",
      details,
    );
  }

  return dead === 0 && stuck === 0
    ? result(
        "email",
        "passed",
        "E-postvarslene går ut, og ingen står fast.",
        details,
      )
    : result(
        "email",
        "failed",
        stuck > 0
          ? `${stuck} e-postvarsler har ventet i køen i over en time.`
          : `${dead} e-postvarsler ble avvist eller gitt opp de siste sju dagene.`,
        details,
      );
}
