import { getEnvironment, updateEnvironmentDetails } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** `?environmentId=`: what the caller may see of one environment. */
export const GET = userQueryRoute(getEnvironment);

/** Administrators change name and details, based on `expectedVersion`. */
export const POST = userCommandRoute(updateEnvironmentDetails);
