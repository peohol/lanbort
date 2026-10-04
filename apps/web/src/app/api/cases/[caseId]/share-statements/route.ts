import { shareCaseStatements } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** A handler shares the parties' statements of a mediation with each other (PS-COM-012). */
export const POST = userPathCommandRoute(shareCaseStatements);
