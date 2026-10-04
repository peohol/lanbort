import { askObjectQuestion, listObjectQuestions } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/**
 * `?environmentId=&objectId=&cursor=`: the questions about an object in one
 * environment, for those who find it there (PS-OBJ-015).
 */
export const GET = userQueryRoute(listObjectQuestions);

/** Asks about an object the caller finds in the environment. */
export const POST = userCommandRoute(askObjectQuestion);
