import { getEnvironment, isDomainError } from "@lanbort/domain";
import { pageQuery } from "@/server/session";

/** The environment's name, if the viewer may still see it (PS-ENV-009). */
export async function environmentName(environmentId: string | null) {
  if (environmentId === null) return null;

  try {
    return (await pageQuery(getEnvironment, { environmentId }))?.name ?? null;
  } catch (error) {
    if (isDomainError(error)) return null;
    throw error;
  }
}
