import { submitAnswers } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** The caller's answers to the current membership requirements. */
export const POST = userCommandRoute(submitAnswers);
