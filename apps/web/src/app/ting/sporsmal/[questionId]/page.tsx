import { listObjectQuestions, readObjectQuestion } from "@lanbort/domain";
import { redirect } from "next/navigation";
import { objectQuestionsHref } from "@/navigation/routes";
import {
  pageQuery,
  pageQueryOrNotFound,
  requirePageAccount,
} from "@/server/session";

/**
 * How many pages of the thing's questions it takes to show this one: the
 * list is newest first, and an answer does not move a question up.
 */
async function pagesUntil(
  questionId: string,
  environmentId: string,
  objectId: string,
): Promise<number> {
  let cursor: string | undefined;

  for (let pages = 1; ; pages += 1) {
    const page = await pageQuery(listObjectQuestions, {
      environmentId,
      objectId,
      cursor,
    });

    if (
      !page?.nextCursor ||
      page.questions.some((question) => question.id === questionId)
    ) {
      return pages;
    }
    cursor = page.nextCursor;
  }
}

/**
 * A question a notification leads to (PS-OBJ-015): on to the thing in the
 * environment it was asked in, at the question. Whether the reader still
 * sees it is the query's policy; what they may not see is not found.
 */
export default async function ObjectQuestionPage({
  params,
}: {
  params: Promise<{ questionId: string }>;
}) {
  await requirePageAccount();
  const { questionId } = await params;
  const { objectId, environmentId } = await pageQueryOrNotFound(
    readObjectQuestion,
    { questionId },
  );

  redirect(
    objectQuestionsHref(
      objectId,
      environmentId,
      questionId,
      await pagesUntil(questionId, environmentId, objectId),
    ),
  );
}
