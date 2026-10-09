import type { SearchParams } from "@/navigation/list-pages";
import {
  type PersonRole,
  personRoleParam,
  personRoleSegment,
  personRoleValues,
} from "@/navigation/routes";

const roles = Object.keys(personRoleValues) as PersonRole[];

/** The role the address opens the person in (UX-PRIV-012), if any. */
export function roleIn(query: SearchParams): PersonRole | null {
  const value = query[personRoleParam];

  return roles.find((role) => personRoleValues[role] === value) ?? null;
}

/** The role a role page's segment (`som-laantaker`) names, if any. */
export function roleOfSegment(segment: string): PersonRole | null {
  return roles.find((role) => personRoleSegment(role) === segment) ?? null;
}
