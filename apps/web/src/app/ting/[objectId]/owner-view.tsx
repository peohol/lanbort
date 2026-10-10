import {
  type CoOwnerLoan,
  type EnvironmentSummary,
  type HomeItem,
  homeItemKinds,
  type Loan,
  type LoanRequest,
  type ObjectCategory,
  type ObjectHistory,
  type ObjectPublication,
  type ObjectQuestion,
  type OwnAccount,
  type OwnObject,
  type SocialContact,
} from "@lanbort/contracts";
import {
  collectPages,
  getObjectHistory,
  getSocialOverview,
  listCoOwnerLoans,
  listLoanRequests,
  listLoans,
  listObjectPublications,
  listObjectQuestions,
  listOwnEnvironments,
  loanHomeItem,
  loanRequestHomeItem,
  takesNewActivity,
} from "@lanbort/domain";
import Link from "next/link";
import { ActionButton } from "@/components/action-button";
import { CommandForm } from "@/components/command-form";
import { ConfirmAction } from "@/components/confirm-action";
import { EmptyState } from "@/components/empty-state";
import { describedBy, Field } from "@/components/field";
import { MoreActions } from "@/components/more-actions";
import { PageHeader } from "@/components/page-header";
import { StatusCard } from "@/components/status-card";
import { ContextTag, Tag } from "@/components/tag";
import { thingsHref } from "@/navigation/areas";
import {
  editObjectHref,
  environmentHref,
  friendsHref,
  loanHref,
} from "@/navigation/routes";
import { anchorFor, hrefFor } from "@/navigation/targets";
import { formatPeriod, formatTime } from "@/presentation/dates";
import { describeHomeItem } from "@/presentation/home-items";
import type { LoanStep } from "@/presentation/loan-status";
import {
  capitalized,
  coOwnerLoanSteps,
  describeCoOwnerLoan,
  describeNextLoan,
  mayPublish,
  nextLoan,
  ownerStatus,
  personName,
  publicationEndLabels,
  publicationStatusLabels,
  restrictionReach,
  revertible,
  revisionChangeLabels,
  revisionFieldLabels,
  shownPlaces,
  withdrawable,
} from "@/presentation/object-owners";
import { describeLoanRequest } from "@/presentation/loan-requests";
import { formatDesiredPeriod, loanStatusLabels } from "@/presentation/loans";
import { ownImageHref } from "@/presentation/object-images";
import { availabilityLine, categoryLabel } from "@/presentation/objects";
import { chatContactLink } from "@/server/chat-contact";
import { pageQuery } from "@/server/session";
import styles from "./owner-view.module.css";
import { QuestionList, questionsId } from "./questions";

/*
 * Links to an environment's page (WP-84) are not prefetched: that page is
 * built alongside this one.
 */

/** What every part of the owners' view knows. */
interface Owned {
  readonly object: OwnObject;
  /** The signed-in owner. */
  readonly me: string;
  /** Whether the owner may start anything new (PS-ADM-002). */
  readonly active: boolean;
  /** Where its commands go. */
  readonly api: string;
}

const others = ({ object, me }: Owned) =>
  object.owners.filter((owner) => owner.userId !== me);

const shared = (owned: Owned) => others(owned).length > 0;

/** A person the owners know, as the subject of a sentence. */
const subjectName = ({ object, me }: Owned, userId: string | null) =>
  capitalized(personName(object, userId, me, true));

/** Who else a step reaches: on a shared thing, every other owner. */
const forEveryOwner = (owned: Owned, text: string) =>
  shared(owned) ? [text] : [];

const unchanged = "Lån som allerede er avtalt, fortsetter som avtalt.";

const inviteHelp =
  "En medeier får de samme rettighetene som deg når hen godtar. Ingen eier kan gripe inn i lån en annen har avtalt.";

/** Archive and restore (PS-OBJ-016): nothing is lost either way. */
function ArchiveAction({ owned }: { owned: Owned }) {
  const { object, api } = owned;

  if (object.status === "archived") return null;

  return (
    <ConfirmAction
      label="Arkiver"
      title={`Arkivere ${object.title}?`}
      confirmLabel={`Arkiver ${object.title}`}
      path={`${api}/archive`}
      body={{}}
      consequences={{
        gone: [
          "Ingen kan be om å låne tingen før den er gjenopprettet.",
          "Åpne forespørsler avsluttes.",
        ],
        stays: [
          "Alt om tingen tas vare på, og den kan gjenopprettes når som helst.",
          unchanged,
        ],
        affects: forEveryOwner(owned, "Tingen arkiveres for alle eierne."),
      }}
    />
  );
}

/**
 * Permanent deletion (PS-OBJ-011): every owner consents, and it happens
 * with the last consent. Until then, a consent can be taken back.
 */
function DeleteAction({ owned }: { owned: Owned }) {
  const { object, me, api } = owned;

  if (object.deletionConsents.includes(me)) {
    return (
      <ActionButton
        label="Trekk samtykket til sletting"
        path={`${api}/deletion/withdraw`}
        body={{}}
      />
    );
  }

  const missing = others(owned).filter(
    (owner) => !object.deletionConsents.includes(owner.userId),
  );
  const last = missing.length === 0;

  return (
    <ConfirmAction
      label={last ? "Slett tingen" : "Samtykk til sletting"}
      title={`Slette ${object.title}?`}
      confirmLabel={last ? `Slett ${object.title}` : "Samtykk til sletting"}
      path={`${api}/deletion/consent`}
      body={{}}
      danger
      next={last ? thingsHref : undefined}
      messages={{
        conflict:
          "Tingen kan ikke slettes mens den er med i et lån som er avtalt, pågår eller ikke er avklart.",
      }}
      consequences={{
        gone: [
          last
            ? "Tingen, bildene og versjonshistorikken slettes for godt."
            : "Tingen, bildene og versjonshistorikken slettes for godt når alle eierne har samtykket.",
          "Åpne forespørsler avsluttes.",
        ],
        stays: ["Avsluttede lån beholder avtalen slik den var."],
        affects: last
          ? []
          : [
              `${missing
                .map((owner) => subjectName(owned, owner.userId))
                .join(", ")} må også samtykke.`,
            ],
      }}
    />
  );
}

/** Status first (UX-INT-001): can it be lent out, and what is next. */
function OwnerStatus({
  owned,
  loans,
  today,
  hidden,
}: {
  owned: Owned;
  loans: readonly Loan[];
  today: string;
  /** Nobody but the owners can see it yet (Tomat kjerneflyt 2). */
  hidden: boolean;
}) {
  const { object, me, active, api } = owned;
  const { status, tone, why } = ownerStatus(object, me, today);
  const next = nextLoan(loans);
  const archived = object.status === "archived";

  return (
    <StatusCard
      status={status}
      tone={tone}
      when={next && describeNextLoan(next)}
      actions={
        active &&
        (archived ? (
          <ActionButton
            label="Gjenopprett"
            path={`${api}/restore`}
            body={{}}
            primary
          />
        ) : (
          <>
            {hidden && (
              <a className="button button-primary" href="#hvor">
                Velg hvor den vises
              </a>
            )}
            <Link className="button" href={editObjectHref(object.id)}>
              Rediger tingen
            </Link>
          </>
        ))
      }
      more={
        <MoreActions>
          <ArchiveAction owned={owned} />
          <DeleteAction owned={owned} />
          {active && (
            <Link className="button" href="#versjoner">
              Versjonshistorikk
            </Link>
          )}
        </MoreActions>
      }
    >
      {why && <p>{why}</p>}
      {hidden && !archived && (
        <p>
          {onlyOwners(owned)}. Ingen andre kan se den ennå. Velg hvor den skal
          vises når du er klar.
        </p>
      )}
    </StatusCard>
  );
}

/** One line in the list of the thing's loans and requests. */
interface LoanEntry {
  readonly id: string;
  readonly href: string | null;
  readonly title: string;
  readonly detail: string;
  /** What it asks of the owner now, if anything (as on Home). */
  readonly waiting: string | null;
  /** Steps taken here, for a loan the owner cannot open. */
  readonly steps: readonly LoanStep[];
}

/** Only what waits on the owner; the status already says the rest. */
const waiting = (item: HomeItem | null) =>
  item && homeItemKinds[item.kind] === "awaiting_you"
    ? describeHomeItem(item).text
    : null;

function requestEntry(request: LoanRequest): LoanEntry {
  const target = { type: "loan_request", id: request.id } as const;

  return {
    id: anchorFor(target.type, request.id),
    href: hrefFor(target),
    title: `Forespørsel: ${formatDesiredPeriod(request.start, request.end)}`,
    detail: describeLoanRequest(request).text,
    waiting: waiting(loanRequestHomeItem(request)),
    steps: [],
  };
}

function loanEntry(loan: Loan): LoanEntry {
  return {
    id: anchorFor("loan", loan.id),
    href: loanHref(loan.id),
    title: `${loan.parties.borrower.realName ?? "En tidligere bruker"}, ${formatPeriod(loan.period)}`,
    detail: `Du er ansvarlig utlåner · ${loanStatusLabels[loan.status]}`,
    waiting: waiting(loanHomeItem(loan)),
    steps: [],
  };
}

/** Another owner's loan, which this owner cannot open but may act on. */
function coOwnerEntry(loan: CoOwnerLoan): LoanEntry {
  return {
    id: anchorFor("loan", loan.loanId),
    href: null,
    title: `Lån ${formatPeriod(loan.period)}`,
    detail: describeCoOwnerLoan(loan),
    waiting: null,
    steps: coOwnerLoanSteps(loan),
  };
}

/**
 * The thing's open requests and current loans (UX-JRN-011): those the
 * owner is the responsible lender of, and another owner's only where this
 * owner may act on it now (PS-LOAN-008, PS-LOAN-009).
 */
function Loans({
  owned,
  entries,
}: {
  owned: Owned;
  entries: readonly LoanEntry[];
}) {
  return (
    <section aria-labelledby="lan">
      <h2 id="lan">Lån og forespørsler</h2>
      {shared(owned) && (
        <p className="quiet">
          Her ser du lån der du er ansvarlig utlåner. Lån en annen eier har
          avtalt, vises bare når det er noe du kan gjøre.
        </p>
      )}
      {entries.length === 0 ? (
        <EmptyState>Ingen åpne forespørsler eller pågående lån.</EmptyState>
      ) : (
        <ul className="entries">
          {entries.map((entry) => (
            <li key={entry.id} id={entry.id} className="entry" tabIndex={-1}>
              <strong id={`${entry.id}-tittel`}>
                {entry.href ? (
                  <Link href={entry.href}>{entry.title}</Link>
                ) : (
                  entry.title
                )}
              </strong>
              <span className="entry-detail">{entry.detail}</span>
              {entry.waiting && (
                <span className="waiting">Venter på deg: {entry.waiting}</span>
              )}
              {entry.steps.length > 0 && (
                <div
                  className="actions"
                  role="group"
                  aria-labelledby={`${entry.id}-tittel`}
                >
                  {entry.steps.map((step) => (
                    <ActionButton key={step.label} {...step} />
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** What borrowers see of it: when, on what terms, and the description. */
function About({
  object,
  categories,
  today,
}: {
  object: OwnObject;
  categories: readonly ObjectCategory[];
  today: string;
}) {
  return (
    <section aria-labelledby="om-tingen" className={styles.card}>
      <h2 id="om-tingen">Om tingen</h2>
      <dl className="facts">
        <dt>Ledig</dt>
        <dd>
          {object.availability.length === 0
            ? "Ingen perioder"
            : availabilityLine(object.availability, today)}
        </dd>
        <dt>Vilkår</dt>
        <dd className="message-text">
          {object.loanTerms ?? "Ingen egne vilkår"}
        </dd>
        <dt>Kategori</dt>
        <dd>{categoryLabel(categories, object.categoryId)}</dd>
        <dt>Beskrivelse</dt>
        <dd className="message-text">{object.description}</dd>
      </dl>
    </section>
  );
}

/** The words for the owners, one or several (UX-PRIV-003). */
const onlyOwners = (owned: Owned) =>
  shared(owned) ? "Bare synlig for eierne" : "Bare synlig for deg";

/**
 * The members' questions about the thing in each environment it is shown
 * in (PS-OBJ-015), which its owners are told about and answer as «Eieren».
 * Each question also opens the private conversation with whoever asked,
 * where the server allows it (PS-COM-006). Left out while nobody has asked.
 */
async function OwnerQuestions({
  owned,
  publications,
}: {
  owned: Owned;
  publications: readonly ObjectPublication[];
}) {
  const asked = (
    await Promise.all(
      publications.flatMap(({ status, environment }) =>
        status === "active" && environment
          ? [
              collectPages(
                (cursor) =>
                  pageQuery(listObjectQuestions, {
                    environmentId: environment.id,
                    objectId: owned.object.id,
                    cursor,
                  }),
                (page) => page.questions,
              ).then(({ items }) => ({ environment, questions: items })),
            ]
          : [],
      ),
    )
  ).filter(({ questions }) => questions.length > 0);

  if (asked.length === 0) return null;

  const contacts = new Map(
    (
      await Promise.all(
        asked
          .flatMap(({ questions }) => questions)
          .map(async ({ id, askedByUserId }: ObjectQuestion) => {
            const link =
              askedByUserId && askedByUserId !== owned.me
                ? await chatContactLink(askedByUserId, {
                    kind: "object_question",
                    questionId: id,
                  })
                : null;

            return link ? [[id, link] as const] : [];
          }),
      )
    ).flat(),
  );

  return (
    <section aria-labelledby={questionsId}>
      <h2 id={questionsId} tabIndex={-1}>
        Spørsmål og svar
      </h2>
      {asked.map(({ environment, questions }) => (
        <section
          key={environment.id}
          aria-labelledby={`${questionsId}-${environment.id}`}
        >
          <h3 id={`${questionsId}-${environment.id}`}>{environment.name}</h3>
          <QuestionList
            userId={owned.me}
            questions={questions}
            contacts={contacts}
          />
        </section>
      ))}
    </section>
  );
}

/**
 * Where the thing is shown, one place a row (PS-OBJ-006, PS-OBJ-017,
 * PS-OBJ-020): each environment the user may publish in and «Venner»,
 * with its state and the step that changes it. An administrator's
 * rejection or block stands until they change it.
 */
function WhereShownSection({
  owned,
  publications,
  environments,
  friends,
}: {
  owned: Owned;
  publications: readonly ObjectPublication[];
  environments: readonly EnvironmentSummary[];
  friends: boolean;
}) {
  const { object, me, api } = owned;
  const open = mayPublish(object, me);
  const places = shownPlaces(publications, environments);

  return (
    <section aria-labelledby="hvor" className={styles.card}>
      <h2 id="hvor">Hvor den vises</h2>
      <ul className={styles.places}>
        {places.map(({ key, environment, publication, publishable }) => {
          const name = environment?.name ?? "Et miljø du ikke er medlem av";
          const state = publication
            ? publicationStatusLabels[publication.status]
            : notPublished;

          return (
            <li key={key}>
              <span className={styles.place} id={`hvor-${key}`}>
                {environment ? (
                  <Link href={environmentHref(environment.id)} prefetch={false}>
                    {name}
                  </Link>
                ) : (
                  name
                )}
              </span>
              <Tag tone={state.tone}>{state.label}</Tag>
              {publication?.endReason && (
                <span className="entry-detail">
                  {publicationEndLabels[publication.endReason]}
                </span>
              )}
              {(publication?.status === "rejected" ||
                publication?.status === "blocked") && (
                <span className="entry-detail">
                  Avgjørelsen står til administratorene endrer den.
                </span>
              )}
              {publication?.status === "pending" && (
                <span className="entry-detail">
                  Medlemmene ser den når administratorene har godkjent den.
                </span>
              )}
              <div
                className={styles.placeActions}
                role="group"
                aria-labelledby={`hvor-${key}`}
              >
                {open && publishable && environment && (
                  <ActionButton
                    label={`Publiser i ${environment.name}`}
                    path={`${api}/publications`}
                    body={{ environmentId: environment.id }}
                  />
                )}
                {publication && withdrawable(publication) && (
                  <ConfirmAction
                    label="Trekk tilbake"
                    title={`Trekke ${object.title} tilbake?`}
                    confirmLabel={`Trekk tilbake fra ${environment?.name ?? "miljøet"}`}
                    path={`${api}/publications/withdraw`}
                    body={{ publicationId: publication.id }}
                    consequences={{
                      gone: [
                        "Medlemmene finner ikke tingen der lenger.",
                        "Åpne forespørsler derfra avsluttes.",
                      ],
                      stays: [unchanged],
                      affects: forEveryOwner(
                        owned,
                        "Tingen trekkes tilbake for alle eierne.",
                      ),
                    }}
                  />
                )}
              </div>
            </li>
          );
        })}
        <li>
          <span className={styles.place} id="hvor-venner">
            Venner
          </span>
          <Tag tone={friends ? "positive" : "neutral"}>
            {friends ? "Synlig for venner" : "Ikke synlig"}
          </Tag>
          <span className="entry-detail">
            {shared(owned)
              ? "Vennene til eierne ser den og kan be om å låne direkte."
              : "Vennene dine ser den på profilen din og kan be om å låne direkte."}
          </span>
          <div
            className={styles.placeActions}
            role="group"
            aria-labelledby="hvor-venner"
          >
            {friends ? (
              <ConfirmAction
                label="Skjul for venner"
                title={`Skjule ${object.title} for venner?`}
                confirmLabel="Skjul for venner"
                path={`${api}/friends/withdraw`}
                body={{}}
                consequences={{
                  gone: [
                    "Vennene finner ikke tingen lenger.",
                    "Åpne forespørsler fra venner avsluttes.",
                  ],
                  stays: [unchanged],
                  affects: forEveryOwner(
                    owned,
                    "Tingen skjules for alle eiernes venner.",
                  ),
                }}
              />
            ) : (
              open && (
                <ActionButton
                  label="Vis for venner"
                  path={`${api}/friends`}
                  body={{}}
                />
              )
            )}
          </div>
        </li>
      </ul>
      {places.length === 0 && (
        <p className="quiet">
          Du er ikke aktivt medlem av noen miljøer der tingen kan publiseres.
        </p>
      )}
    </section>
  );
}

const notPublished = { label: "Ikke publisert", tone: "neutral" } as const;

/**
 * The owners and those invited (PS-OBJ-007, PS-OBJ-010): every owner has
 * the same rights, nobody can remove another, and one can step out as
 * long as someone stays and they hold no loan.
 */
function Owners({
  owned,
  friends,
}: {
  owned: Owned;
  friends: readonly SocialContact[] | null;
}) {
  const { object, me, active, api } = owned;
  const known = new Set([
    ...object.owners.map((owner) => owner.userId),
    ...object.pendingInvitations.map((invitation) => invitation.userId),
  ]);
  const candidates = (friends ?? []).filter(
    (friend) => !known.has(friend.userId),
  );
  const consented = object.deletionConsents.map((userId) =>
    subjectName(owned, userId),
  );

  return (
    <section aria-labelledby="eiere">
      <h2 id="eiere">Eiere</h2>
      <ul className="entries">
        {object.owners.map((owner) => (
          <li key={owner.userId} className="entry">
            <strong>{subjectName(owned, owner.userId)}</strong>
          </li>
        ))}
        {object.pendingInvitations.map((invitation) => (
          <li key={invitation.id} className="entry">
            <strong id={`invitasjon-${invitation.id}`}>
              {subjectName(owned, invitation.userId)}
            </strong>
            <span className="entry-detail">
              Invitert av {personName(object, invitation.invitedByUserId, me)},
              har ikke svart ennå
            </span>
            <div
              className="actions"
              role="group"
              aria-labelledby={`invitasjon-${invitation.id}`}
            >
              <ActionButton
                label="Trekk invitasjonen"
                path={`${api}/co-owners/invitations/withdraw`}
                body={{ invitationId: invitation.id }}
              />
            </div>
          </li>
        ))}
      </ul>
      {consented.length > 0 && (
        <p>Samtykket til sletting: {consented.join(", ")}.</p>
      )}
      {active &&
        object.status === "active" &&
        (candidates.length === 0 ? (
          <p className="quiet">
            Du kan invitere venner til å bli medeiere.{" "}
            <Link href={friendsHref}>Se vennene dine</Link>
          </p>
        ) : (
          <CommandForm
            path={`${api}/co-owners/invitations`}
            submitLabel="Inviter som medeier"
            secondary
          >
            <Field
              id="ny-medeier"
              label="Inviter en venn som medeier"
              help={inviteHelp}
            >
              <select
                id="ny-medeier"
                name="userId"
                {...describedBy("ny-medeier", inviteHelp)}
              >
                {candidates.map((friend) => (
                  <option key={friend.userId} value={friend.userId}>
                    {friend.realName ?? "Uten navn"}
                  </option>
                ))}
              </select>
            </Field>
          </CommandForm>
        ))}
      {shared(owned) && (
        <div className="actions">
          <ConfirmAction
            label="Tre ut som eier"
            title={`Tre ut som eier av ${object.title}?`}
            confirmLabel="Tre ut som eier"
            path={`${api}/co-owners/leave`}
            body={{}}
            danger
            next={thingsHref}
            messages={{
              conflict:
                "Du kan ikke tre ut mens du er ansvarlig utlåner for et lån som ikke er avsluttet. Overfør ansvaret, eller vent til lånet er avsluttet.",
            }}
            consequences={{
              gone: [
                "Du er ikke lenger eier, og tingen forsvinner fra Mine ting.",
                ...(object.restrictions.some(
                  (restriction) => restriction.setByUserId === me,
                )
                  ? ["Stansen av nye lån du har satt, oppheves."]
                  : []),
              ],
              stays: [
                `${others(owned)
                  .map((owner) => subjectName(owned, owner.userId))
                  .join(", ")} beholder tingen.`,
                unchanged,
              ],
            }}
          />
        </div>
      )}
    </section>
  );
}

/**
 * Co-owners' restrictions on new loans (PS-OBJ-008, UX-EXC-006): any owner
 * can stop new loans for a period or altogether, and only the one who did
 * can lift it.
 */
function Restrictions({ owned }: { owned: Owned }) {
  const { object, me, active, api } = owned;

  if (!shared(owned) && object.restrictions.length === 0) return null;

  return (
    <section aria-labelledby="stans">
      <h2 id="stans">Stans av nye lån</h2>
      <p className="quiet">
        Hver eier kan stanse nye lån i en periode eller helt. Bare den som
        stanset, kan oppheve stansen. {unchanged}
      </p>
      {object.restrictions.length > 0 && (
        <ul className="entries">
          {object.restrictions.map((restriction) => (
            <li key={restriction.id} className="entry">
              <strong id={`stans-${restriction.id}`}>
                {subjectName(owned, restriction.setByUserId)} har stanset nye
                lån {restrictionReach(restriction)}
              </strong>
              {restriction.setByUserId === me ? (
                active && (
                  <div
                    className="actions"
                    role="group"
                    aria-labelledby={`stans-${restriction.id}`}
                  >
                    <ActionButton
                      label="Opphev stansen"
                      path={`${api}/restrictions/lift`}
                      body={{ restrictionId: restriction.id }}
                    />
                  </div>
                )
              ) : (
                <span className="entry-detail">
                  Bare {personName(object, restriction.setByUserId, me)} kan
                  oppheve den.
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {active && shared(owned) && object.status === "active" && (
        <>
          <CommandForm
            path={`${api}/restrictions`}
            submitLabel="Stans nye lån i perioden"
            secondary
          >
            <fieldset>
              <legend>Stans nye lån i en periode</legend>
              <Field id="stans-fra" label="Fra og med">
                <input
                  id="stans-fra"
                  name="period.start"
                  type="date"
                  required
                />
              </Field>
              <Field id="stans-til" label="Til og med">
                <input id="stans-til" name="period.end" type="date" required />
              </Field>
            </fieldset>
          </CommandForm>
          <div className="actions">
            <ConfirmAction
              label="Stans alle nye lån"
              title={`Stanse alle nye lån av ${object.title}?`}
              confirmLabel="Stans alle nye lån"
              path={`${api}/restrictions`}
              body={{ period: null }}
              consequences={{
                gone: [
                  "Ingen av eierne kan avtale nye lån eller publisere tingen i nye miljøer.",
                ],
                stays: [unchanged],
                affects: [
                  "De andre eierne kan ikke oppheve stansen. Bare du kan.",
                ],
              }}
            />
          </div>
        </>
      )}
    </section>
  );
}

/**
 * Every version, who made it and when (PS-OBJ-013). An earlier version's
 * content can be brought back as a new version; later history stays.
 */
function Versions({
  owned,
  history,
}: {
  owned: Owned;
  history: ObjectHistory;
}) {
  const { object, api } = owned;

  return (
    <details id="versjoner">
      <summary>Versjonshistorikk</summary>
      <ol className="entries" aria-label="Versjoner, nyeste først">
        {history.revisions.map((revision) => (
          <li key={revision.version} className="entry">
            <strong id={`versjon-${revision.version}`}>
              Versjon {revision.version}:{" "}
              {revisionChangeLabels[revision.change]}
              {revision.revertedToVersion !== null &&
                ` (versjon ${revision.revertedToVersion})`}
            </strong>
            {revision.change === "updated" &&
              revision.changedFields.length > 0 && (
                <span>
                  Endret{" "}
                  {revision.changedFields
                    .map((field) => revisionFieldLabels[field])
                    .join(", ")}
                </span>
              )}
            <span className="entry-detail">
              {revision.actorUserId === null
                ? ""
                : `${subjectName(owned, revision.actorUserId)}, `}
              <time dateTime={revision.recordedAt}>
                {formatTime(revision.recordedAt)}
              </time>
            </span>
            {revertible(revision, object) && (
              <div
                className="actions"
                role="group"
                aria-labelledby={`versjon-${revision.version}`}
              >
                <ConfirmAction
                  label="Hent tilbake"
                  title={`Hente tilbake versjon ${revision.version}?`}
                  confirmLabel={`Hent tilbake versjon ${revision.version}`}
                  path={`${api}/history/revert`}
                  body={{
                    version: revision.version,
                    expectedVersion: object.version,
                  }}
                  consequences={{
                    gone: [
                      "Tittel, kategori, beskrivelse, vilkår og tilgjengelighet blir som i denne versjonen.",
                    ],
                    stays: [
                      "Nyere versjoner blir liggende i historikken.",
                      "Bildene er som nå.",
                      unchanged,
                    ],
                  }}
                />
              </div>
            )}
          </li>
        ))}
      </ol>
      {history.nextBeforeVersion !== null && (
        <p className="quiet">Eldre versjoner vises ikke her.</p>
      )}
    </details>
  );
}

/**
 * The owners' view of a thing (WP-82, UX-JRN-011): whether it can be lent
 * out and what is next, its loans and requests, where it is published,
 * who owns it and what stops new loans, and the rarer steps under «Flere
 * valg». Every owner sees the same (PS-OBJ-007); each part is read through
 * its own query's policy, and an account that is not active is shown only
 * what it may still finish (PS-ADM-002).
 */
export async function OwnerView({
  account,
  object,
  categories,
  today,
}: {
  account: OwnAccount;
  object: OwnObject;
  categories: readonly ObjectCategory[];
  today: string;
}) {
  const owned: Owned = {
    object,
    me: account.userId,
    active: takesNewActivity(account.status),
    api: `/api/objects/${object.id}`,
  };
  const objectId = object.id;
  const ifActive = <T,>(read: () => Promise<T>) =>
    owned.active ? read() : Promise.resolve(null);
  const [requests, loans, coOwned, published, environments, social, history] =
    await Promise.all([
      collectPages(
        (cursor) =>
          pageQuery(listLoanRequests, {
            role: "lender",
            state: "open",
            objectId,
            cursor,
          }),
        (page) => page.requests,
      ),
      collectPages(
        (cursor) =>
          pageQuery(listLoans, {
            state: "current",
            role: "lender",
            objectId,
            cursor,
          }),
        (page) => page.loans,
      ),
      ifActive(() => pageQuery(listCoOwnerLoans, {})),
      ifActive(() => pageQuery(listObjectPublications, { objectId })),
      ifActive(() => pageQuery(listOwnEnvironments, {})),
      ifActive(() => pageQuery(getSocialOverview, {})),
      ifActive(() => pageQuery(getObjectHistory, { objectId })),
    ]);
  const entries = [
    ...requests.items.map(requestEntry),
    ...loans.items.map(loanEntry),
    ...(coOwned?.items ?? [])
      .filter((loan) => loan.objectId === objectId)
      .map(coOwnerEntry),
  ];

  const friends = published?.friends != null;
  const hidden =
    published !== null &&
    !friends &&
    !published.publications.some(withdrawable);
  const [cover] = object.images;

  return (
    <main>
      <PageHeader
        title={object.title}
        kind={shared(owned) ? "Deres ting" : "Din ting"}
        back={{ href: thingsHref, label: "Mine ting" }}
        picture={
          cover && (
            // The API's own address; nothing to optimize.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.cover}
              src={ownImageHref(object.id, cover.id)}
              alt=""
            />
          )
        }
        context={
          <>
            <ContextTag label="Kategori">
              {categoryLabel(categories, object.categoryId)}
            </ContextTag>
            {shared(owned) && <Tag>Dere er {object.owners.length} eiere</Tag>}
          </>
        }
      />
      <OwnerStatus
        owned={owned}
        loans={loans.items}
        today={today}
        hidden={hidden}
      />
      <Loans owned={owned} entries={entries} />
      {published && (
        <OwnerQuestions owned={owned} publications={published.publications} />
      )}
      {published && (
        <WhereShownSection
          owned={owned}
          publications={published.publications}
          environments={environments ?? []}
          friends={friends}
        />
      )}
      <About object={object} categories={categories} today={today} />
      <Owners owned={owned} friends={social?.friends ?? null} />
      <Restrictions owned={owned} />
      {history && <Versions owned={owned} history={history} />}
    </main>
  );
}
