import { listCaseMeasures, takeModerationMeasure } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** The measures taken on a report, for its handlers (PS-TRUST-016). */
export const GET = userQueryRoute(listCaseMeasures);

/** `{ measure, dimension?, reason }`: the report's handler takes a measure (PS-TRUST-013–016). */
export const POST = userCommandRoute(takeModerationMeasure);
