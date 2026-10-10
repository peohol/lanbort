import type { ObjectQuestion } from "@lanbort/contracts";
import Link from "next/link";
import { CommandForm } from "@/components/command-form";
import { EmptyState } from "@/components/empty-state";
import { describedBy, Field } from "@/components/field";
import { questionAnchor, questionsAnchor } from "@/navigation/routes";
import { formatTime } from "@/presentation/dates";
import type { ChatContactLink } from "@/server/chat-contact";

/** The element id of the questions, for links back to them. */
export const questionsId = questionsAnchor;

/** Who wrote a post, as members of the environment see it (PS-OBJ-015). */
function author(post: ObjectQuestion["posts"][number], userId: string): string {
  if (post.authorUserId === userId) return "Du";
  return post.byOwner ? "Eieren" : "Et medlem";
}

/**
 * The questions about the thing in one environment, each with its answers
 * and a way to answer. The one a question was asked of may also open the
 * private conversation with whoever asked (PS-COM-006, PS-COM-017); the
 * asker stays «Et medlem» here (PS-OBJ-015).
 */
export function QuestionList({
  userId,
  questions,
  contacts,
}: {
  userId: string;
  questions: readonly ObjectQuestion[];
  /** The way to each asker the reader may write to, by question. */
  contacts?: ReadonlyMap<string, ChatContactLink>;
}) {
  return (
    <ul className="entries">
      {questions.map((question) => {
        const contact = contacts?.get(question.id);

        return (
          <li
            key={question.id}
            id={questionAnchor(question.id)}
            className="entry"
          >
            {question.posts.map((post) => (
              <p key={post.id} className="message-text">
                <strong>{author(post, userId)}:</strong> {post.body}{" "}
                <time className="entry-detail" dateTime={post.createdAt}>
                  {formatTime(post.createdAt)}
                </time>
              </p>
            ))}
            {contact && (
              <p className="link-row">
                <Link href={contact.href}>
                  {contact.existing
                    ? "Gå til samtalen"
                    : "Start privat samtale"}
                </Link>
              </p>
            )}
            <details>
              <summary>Svar</summary>
              <CommandForm
                key={question.posts.length}
                path="/api/object-questions/reply"
                fixed={{ questionId: question.id }}
                submitLabel="Send svaret"
                secondary
              >
                <Field id={`svar-${question.id}`} label="Svaret ditt">
                  <textarea
                    id={`svar-${question.id}`}
                    name="body"
                    rows={2}
                    maxLength={2000}
                    required
                  />
                </Field>
              </CommandForm>
            </details>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The environment's questions and answers about the thing (PS-OBJ-015,
 * WP-63): seen only by those who find it there, and only there. Each form
 * is new once it has been sent, so the next question gets its own key.
 */
export function Questions({
  environmentId,
  objectId,
  userId,
  questions,
  more,
}: {
  environmentId: string;
  objectId: string;
  userId: string;
  questions: readonly ObjectQuestion[];
  /** The address with one more page, while there is one. */
  more: string | null;
}) {
  const askId = "nytt-sporsmal";
  const askHelp =
    "Spørsmål og svar vises for alle som finner tingen i dette miljøet.";

  return (
    <section aria-labelledby={questionsId}>
      <h2 id={questionsId} tabIndex={-1}>
        Spørsmål og svar
      </h2>
      {questions.length === 0 ? (
        <EmptyState>Ingen har spurt om tingen her ennå.</EmptyState>
      ) : (
        <QuestionList userId={userId} questions={questions} />
      )}
      {more && (
        <p className="link-row">
          <a href={more}>Vis flere spørsmål</a>
        </p>
      )}
      <CommandForm
        key={questions[0]?.id ?? "ingen"}
        path="/api/object-questions"
        fixed={{ environmentId, objectId }}
        submitLabel="Still spørsmålet"
        secondary
      >
        <Field id={askId} label="Spør om tingen" help={askHelp}>
          <textarea
            id={askId}
            name="body"
            rows={2}
            maxLength={2000}
            required
            {...describedBy(askId, askHelp)}
          />
        </Field>
      </CommandForm>
    </section>
  );
}
