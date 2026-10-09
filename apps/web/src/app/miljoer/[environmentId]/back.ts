import type { Environment } from "@lanbort/contracts";
import { type AreaId, findHref, homeHref } from "@/navigation/areas";

/**
 * Where an environment belongs (UX-IA-011): a member's own environments
 * are reached from Home, others from Finn.
 */
export const environmentHome = (environment: Environment): AreaId =>
  environment.membership ? "home" : "find";

export const environmentBack = (environment: Environment) =>
  environmentHome(environment) === "home"
    ? { href: homeHref, label: "Hjem" }
    : { href: `${findHref}?vis=miljoer`, label: "Finn" };
