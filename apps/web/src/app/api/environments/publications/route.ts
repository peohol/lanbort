import { listEnvironmentPublications } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** `?environmentId=&status=&cursor=`: publications for administrators to review. */
export const GET = userQueryRoute(listEnvironmentPublications);
