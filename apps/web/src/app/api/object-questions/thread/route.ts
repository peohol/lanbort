import { readObjectQuestion } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** `?questionId=`: one question with its posts, as a notification leads to it. */
export const GET = userQueryRoute(readObjectQuestion);
