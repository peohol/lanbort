import type { Environment } from "@lanbort/contracts";
import { type AreaId, findHref, homeHref } from "@/navigation/areas";
import { environmentArchiveHref } from "@/navigation/routes";

/**
 * Where an environment belongs (UX-IA-011): a member's own environments
 * are reached from Home, others from Finn.
 */
export const environmentHome = (environment: Environment): AreaId =>
  environment.membership ? "home" : "find";

/** A wound-down one is reached from its members' archive (UX-IA-023). */
export const environmentBack = (environment: Environment) =>
  environment.woundDownAt !== null
    ? { href: environmentArchiveHref, label: "Avviklede miljøer" }
    : environmentHome(environment) === "home"
      ? { href: homeHref, label: "Hjem" }
      : { href: `${findHref}?vis=miljoer`, label: "Finn" };
