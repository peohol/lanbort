import { replyToObjectQuestion } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Answers or adds to a question the caller sees. */
export const POST = userCommandRoute(replyToObjectQuestion);
