import { readObjectQuestion } from "@lanbort/domain";
import { redirect } from "next/navigation";
import { objectQuestionsHref } from "@/navigation/routes";
import { pageQueryOrNotFound, requirePageAccount } from "@/server/session";

/**
 * A question a notification leads to (PS-OBJ-015): on to the thing in the
 * environment it was asked in, at its questions. Whether the reader still
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

  redirect(objectQuestionsHref(objectId, environmentId));
}
