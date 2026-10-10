import type { Case, CaseEntry } from "@lanbort/contracts";
import { Icon, type IconName } from "@/components/icon";
import { ProfilePicture } from "@/components/profile-picture";
import { audienceLabel, entryAuthor, personIn } from "@/presentation/cases";
import { formatShortTime } from "@/presentation/dates";
import styles from "../cases.module.css";

export interface EntryViewer {
  readonly userId: string;
  readonly environment: string | null;
}

/** What the reader is told under an entry: who sees it, or who does not. */
function seenBy(
  entry: CaseEntry,
  c: Case,
  viewer: EntryViewer,
): { text: string; icon: IconName } | null {
  if (c.viewer === "handler") {
    return audienceLabel(entry, c.people, c);
  }

  // PS-COM-012: the reader's own statement, before it is shared.
  if (
    entry.capacity === "party" &&
    entry.authorUserId === viewer.userId &&
    !entry.shared
  ) {
    const others = c.participants
      .filter((participant) => participant.userId !== viewer.userId)
      .map((participant) => personIn(c.people, participant.userId));

    return {
      text: `${others.join(" og ") || "Den andre parten"} ser ikke dette før administratoren deler forklaringene`,
      icon: "hidden",
    };
  }

  return null;
}

/** One entry: who wrote it and when, what it says, and who sees it. */
function Entry({
  entry,
  c,
  viewer,
}: {
  entry: CaseEntry;
  c: Case;
  viewer: EntryViewer;
}) {
  const author = entryAuthor(entry, c, viewer);
  const byHandler = entry.capacity === "handler";
  const note = entry.audience === "handlers";
  const seen = seenBy(entry, c, viewer);
  const corrected = c.entries.find(({ id }) => id === entry.correctsEntryId);
  const className = [
    styles.entry,
    byHandler && !note ? styles.handlerEntry : "",
    note ? styles.note : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <li id={`innlegg-${entry.id}`} className={className}>
      <div className={styles.entryHead}>
        {byHandler ? (
          <span className={styles.function}>
            <Icon name="shield" />
          </span>
        ) : (
          <ProfilePicture
            pictureId={null}
            name={personIn(c.people, entry.authorUserId)}
            initials
          />
        )}
        <strong>{author}</strong>
        <time dateTime={entry.createdAt}>
          {formatShortTime(entry.createdAt)}
        </time>
      </div>
      {entry.closing && (
        <p className={styles.aside}>
          <Icon name="check" />
          Avslutningsmelding
        </p>
      )}
      {entry.correctsEntryId && (
        <p className={styles.aside}>
          <Icon name="edit" />
          <a href={`#innlegg-${entry.correctsEntryId}`}>
            {corrected
              ? `Retter innlegget fra ${formatShortTime(corrected.createdAt)}`
              : "Retter et tidligere innlegg"}
          </a>
        </p>
      )}
      <p className={styles.body}>{entry.body}</p>
      {entry.privateMessages.length > 0 && (
        <details>
          <summary>
            {entry.privateMessages.length === 1
              ? "1 privat melding sendt inn"
              : `${entry.privateMessages.length} private meldinger sendt inn`}
          </summary>
          <p className="help">
            En kopi parten selv valgte å sende inn. Lånbort kan ikke bekrefte at
            den er lik meldingen i samtalen.
          </p>
          <ol className={styles.entries}>
            {entry.privateMessages.map((copy) => (
              <li key={copy.messageId} className={styles.copies}>
                <p className={styles.aside}>
                  {personIn(c.people, copy.senderUserId)} ·{" "}
                  <time dateTime={copy.sentAt}>
                    {formatShortTime(copy.sentAt)}
                  </time>
                </p>
                <p className={styles.body}>{copy.body}</p>
              </li>
            ))}
          </ol>
        </details>
      )}
      {seen && (
        <p className={styles.aside}>
          <Icon name={seen.icon} />
          {seen.text}
        </p>
      )}
    </li>
  );
}

/**
 * What was written in the case, oldest first (PS-COM-013–014). A handler's
 * entry is the function's to the parties, with a mark at its side; an
 * internal note has a dashed edge. A correction points to what it corrects,
 * which stays as it was.
 */
export function Entries({ c, viewer }: { c: Case; viewer: EntryViewer }) {
  return (
    <section className={styles.section} aria-labelledby="innlegg">
      <div className={styles.sectionHead}>
        <h2 id="innlegg">Innlegg</h2>
        <span>eldste først</span>
      </div>
      {c.entries.length === 0 ? (
        <p className="quiet">Ingen innlegg du kan se ennå.</p>
      ) : (
        <ol className={styles.entries} aria-label="Innlegg, eldste først">
          {c.entries.map((entry) => (
            <Entry key={entry.id} entry={entry} c={c} viewer={viewer} />
          ))}
        </ol>
      )}
    </section>
  );
}
