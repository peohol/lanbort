import type {
  EnvironmentSummary,
  HomeItem,
  HomeOverview,
  HomeSection,
} from "@lanbort/contracts";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { environmentHref, newEnvironmentHref } from "@/navigation/routes";
import { calendarDay } from "@/presentation/dates";
import { administrationHref } from "@/presentation/environment-admin";
import { roleName } from "@/presentation/environments";
import { homeItemHref, homeSectionHeadings } from "@/presentation/home-items";
import {
  administrationByEnvironment,
  administrationText,
  arrangeAwaiting,
  dayLeaf,
  groupAbout,
  groupAction,
  homeCard,
  homeRow,
  loanContext,
  unresolvedText,
  upcomingText,
} from "@/presentation/home-tasks";
import { findEnvironmentsHref } from "@/presentation/search";
import {
  type StewardStanding,
  stewardHomeTask,
} from "@/presentation/stewardship";
import { EmptyState } from "./empty-state";
import { Icon, type IconName } from "./icon";
import { ContextTag, Tag } from "./tag";
import { ThingThumbnail } from "./thing-thumbnail";
import styles from "./home-view.module.css";

const hrefOf = (item: HomeItem) =>
  administrationHref(item) ?? homeItemHref(item);

const keyOf = (item: HomeItem) => `${item.kind}/${item.target.id}`;

/** A whole entry that leads somewhere, or only says what it is. */
function Entry({
  href,
  className,
  children,
}: {
  href: string | null;
  className: string | undefined;
  children: ReactNode;
}) {
  return href ? (
    <Link className={className} href={href}>
      {children}
      <Icon name="chevron" className={`icon ${styles.chevron}`} />
    </Link>
  ) : (
    <div className={className}>{children}</div>
  );
}

function Via({ item }: { item: HomeItem }) {
  return item.via ? (
    <ContextTag label="Kontekst" icon="environment">
      Via {item.via}
    </ContextTag>
  ) : null;
}

/** Today's task, or the only one: the whole card (UX-IA-018). */
function TaskCard({ item, today }: { item: HomeItem; today: string }) {
  const card = homeCard(item, today);
  const href = hrefOf(item);
  const id = `oppgave-${item.kind.replace(".", "-")}-${item.target.id}`;

  return (
    <article className={`card ${styles.card}`} aria-labelledby={id}>
      <p className={styles.tagLine}>
        <Tag tone={card.tag.tone} icon={card.tag.icon}>
          {card.tag.text}
        </Tag>
      </p>
      <div className={styles.cardHead}>
        <ThingThumbnail picture={item.picture} />
        <h3 id={id} className={styles.cardTitle}>
          {card.title}
        </h3>
      </div>
      {card.hint && <p className={styles.hint}>{card.hint}</p>}
      <div className={styles.cardFoot}>
        <Via item={item} />
        {href && (
          <Link className="button button-primary" href={href}>
            {card.open} <Icon name="chevron" />
          </Link>
        )}
      </div>
    </article>
  );
}

function Row({
  icon,
  action,
  about,
  picture = null,
}: {
  icon: IconName;
  action: string;
  about: string;
  picture?: HomeItem["picture"];
}) {
  return (
    <>
      <ThingThumbnail
        picture={picture}
        fallback={
          <span className={styles.rowIcon}>
            <Icon name={icon} />
          </span>
        }
      />
      <span className={styles.rowText}>
        <strong>{action}</strong>
        {about && <span>{about}</span>}
      </span>
    </>
  );
}

function TaskRow({ item }: { item: HomeItem }) {
  return (
    <Entry href={hrefOf(item)} className={styles.row}>
      <Row {...homeRow(item)} picture={item.picture} />
    </Entry>
  );
}

/** Many of the same task: one row with how many, opening to each one. */
function TaskGroup({ items }: { items: readonly HomeItem[] }) {
  const first = items[0]!;

  return (
    <details className={styles.group}>
      <summary className={styles.row}>
        <Row
          icon={homeRow(first).icon}
          action={groupAction(first.kind, items.length)!}
          about={groupAbout(items)}
        />
      </summary>
      <ul className={styles.list}>
        {items.map((item) => (
          <li key={keyOf(item)}>
            <TaskRow item={item} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function Awaiting({ items, today }: { items: HomeItem[]; today: string }) {
  const entries = arrangeAwaiting(items, today);

  return (
    <div className={styles.stack}>
      {entries.map((entry) =>
        entry.type === "card" ? (
          <TaskCard key={keyOf(entry.item)} item={entry.item} today={today} />
        ) : null,
      )}
      {entries.some((entry) => entry.type !== "card") && (
        <ul className={styles.list}>
          {entries.map((entry) =>
            entry.type === "row" ? (
              <li key={keyOf(entry.item)}>
                <TaskRow item={entry.item} />
              </li>
            ) : entry.type === "group" ? (
              <li key={`gruppe-${entry.kind}`}>
                <TaskGroup items={entry.items} />
              </li>
            ) : null,
          )}
        </ul>
      )}
    </div>
  );
}

function Upcoming({ items, today }: { items: HomeItem[]; today: string }) {
  return (
    <ul className={styles.list}>
      {items.map((item) => {
        const leaf = item.day && dayLeaf(item.day, today);
        const context = loanContext(item);

        return (
          <li key={keyOf(item)}>
            <Entry href={hrefOf(item)} className={styles.upcoming}>
              {leaf && (
                <span className={styles.leaf}>
                  <span aria-hidden="true">
                    <small>{leaf.weekday}</small>
                    {leaf.day}
                  </span>
                  <span className="visually-hidden">{leaf.label}: </span>
                </span>
              )}
              <ThingThumbnail picture={item.picture} />
              <span className={styles.rowText}>
                <strong>{upcomingText(item)}</strong>
                {context && <span>{context}</span>}
              </span>
            </Entry>
          </li>
        );
      })}
    </ul>
  );
}

function Unresolved({ items }: { items: HomeItem[] }) {
  return (
    <ul className={styles.list}>
      {items.map((item) => {
        const { tag, title, detail } = unresolvedText(item);

        return (
          <li key={keyOf(item)}>
            <Entry href={hrefOf(item)} className={styles.unresolved}>
              <ThingThumbnail picture={item.picture} />
              <span className={styles.rowText}>
                <span>
                  <Tag tone={tag.tone} icon={tag.icon}>
                    {tag.text}
                  </Tag>
                </span>
                <strong>{title}</strong>
                {detail && <span>{detail}</span>}
              </span>
            </Entry>
          </li>
        );
      })}
    </ul>
  );
}

function Administration({
  items,
  environments,
}: {
  items: HomeItem[];
  environments: readonly EnvironmentSummary[];
}) {
  const { environments: groups } = administrationByEnvironment(items);

  return (
    <div className={styles.stack}>
      {groups.map((group) => {
        const role = roleName(
          environments.find(({ id }) => id === group.id)?.roles ?? [
            "administrator",
          ],
        );

        return (
          <div
            key={group.id}
            className={`card ${styles.administration}`}
            role="group"
            aria-label={group.name}
          >
            <p className={styles.administrationHead}>
              <strong>{group.name}</strong>
              {role && (
                <Tag tone="attention" icon={null}>
                  Du er {role.toLocaleLowerCase("nb")}
                </Tag>
              )}
            </p>
            <ul className={styles.tasks}>
              {group.items.map((item) => (
                <li key={keyOf(item)}>
                  <Entry href={hrefOf(item)} className={styles.task}>
                    <strong>{administrationText(item)}</strong>
                  </Entry>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Environments({
  environments,
}: {
  environments: readonly EnvironmentSummary[];
}) {
  return (
    <>
      <ul className={`${styles.list} ${styles.environments}`}>
        {environments.map((environment) => {
          const role = roleName(environment.roles);

          return (
            <li key={environment.id}>
              <Entry
                href={environmentHref(environment.id)}
                className={styles.environment}
              >
                <strong>{environment.name}</strong>
                {role && <span className={styles.role}>{role}</span>}
              </Entry>
            </li>
          );
        })}
      </ul>
      <p className="link-row">
        <Link href={newEnvironmentHref}>Opprett et miljø</Link>
      </p>
    </>
  );
}

/** A platform steward's standing, as Home shows it. */
export interface StewardHome {
  readonly standing: StewardStanding;
  /** Open platform cases nobody has taken; null until confirmed. */
  readonly unassigned: number | null;
}

/**
 * «For Lånbort» (Tomat «Plattformforvaltning v1»): the steward's role in a
 * section of its own, as an administrator's is, with the one task it has.
 */
function Stewardship({ steward }: { steward: StewardHome }) {
  const task = stewardHomeTask(steward.standing, steward.unassigned);

  return (
    <section aria-labelledby="hjem-lanbort">
      <h2 id="hjem-lanbort" className={styles.heading}>
        <Icon name="shield" />
        For Lånbort
      </h2>
      <div
        className={`card ${styles.administration}`}
        role="group"
        aria-label="Forvaltning"
      >
        <p className={styles.administrationHead}>
          <strong>Forvaltning</strong>
          <Tag tone="attention" icon={null}>
            Du er plattformforvalter
          </Tag>
        </p>
        <ul className={styles.tasks}>
          <li>
            <Entry href={task.href} className={styles.task}>
              <span className={styles.rowText}>
                <strong>{task.text}</strong>
                {task.detail && <span>{task.detail}</span>}
              </span>
            </Entry>
          </li>
        </ul>
      </div>
    </section>
  );
}

const sectionIcons: Partial<Record<HomeSection, IconName>> = {
  administration: "shield",
};

/**
 * Home (UX-IA-005, UX-IA-016–018, «Hjem og varsler v3»): what waits for
 * the user, what is coming, what is unsettled, their tasks as
 * administrator and their environments, always in that order. Empty
 * sections are left out, so a quiet day shows a quiet Home. Every entry
 * opens the place where the work is done; nothing here is binding.
 */
export function HomeView({
  home,
  steward = null,
}: {
  home: HomeOverview;
  steward?: StewardHome | null;
}) {
  const today = calendarDay();
  const sections = home.sections.filter(({ items }) => items.length > 0);
  const counted = (section: HomeSection, items: HomeItem[]) =>
    section === "administration"
      ? administrationByEnvironment(items).total
      : items.length;

  return (
    <main className={styles.home}>
      <h1 className={styles.title}>Hjem</h1>
      {sections.length === 0 && (
        <EmptyState
          action={
            home.environments.length === 0 && (
              <Link
                className="button button-secondary"
                href={findEnvironmentsHref}
              >
                Finn miljøer
              </Link>
            )
          }
        >
          <strong className={styles.emptyTitle}>Ingenting venter på deg</strong>{" "}
          {home.environments.length === 0
            ? "Du er ikke med i noen miljøer ennå. Der finner du ting å låne av folk i nærheten."
            : "Når noen vil låne av deg, eller noe skal hentes eller leveres, står det her."}
        </EmptyState>
      )}
      <div className={styles.sections}>
        {sections.map(({ section, items }) => {
          const icon = sectionIcons[section];
          // The steward's role comes right after what waits on the user.
          const stewardFirst =
            steward &&
            section ===
              sections.find((each) => each.section !== "awaiting_you")?.section;

          return (
            <Fragment key={section}>
              {stewardFirst && <Stewardship steward={steward} />}
              <section aria-labelledby={`hjem-${section}`}>
                <h2 id={`hjem-${section}`} className={styles.heading}>
                  {icon && <Icon name={icon} />}
                  {homeSectionHeadings[section](counted(section, items))}
                </h2>
                {section === "awaiting_you" ? (
                  <Awaiting items={items} today={today} />
                ) : section === "upcoming" ? (
                  <Upcoming items={items} today={today} />
                ) : section === "unresolved" ? (
                  <Unresolved items={items} />
                ) : (
                  <Administration
                    items={items}
                    environments={home.environments}
                  />
                )}
              </section>
            </Fragment>
          );
        })}
        {steward &&
          sections.every(({ section }) => section === "awaiting_you") && (
            <Stewardship steward={steward} />
          )}
        {home.environments.length > 0 && (
          <section aria-labelledby="hjem-miljoer">
            <h2 id="hjem-miljoer" className={styles.heading}>
              Dine miljøer
            </h2>
            <Environments environments={home.environments} />
          </section>
        )}
      </div>
    </main>
  );
}
