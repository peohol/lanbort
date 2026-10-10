import { withdrawReport } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

/** The reporter withdraws the report; it stays open for its assessment. */
export const POST = userPathCommandRoute(withdrawReport);
