import { definePolicy } from "../authorization/policy";
import {
  requireActiveAccount,
  requireSystemProcess,
} from "../authorization/rules";

/**
 * Finn (UX-IA-001) is for signed-in users with a finished registration. What
 * each of them finds is decided in the query by the same rules as everywhere
 * else, never by the index (ADR-0005).
 */
const finnPolicy = (action: string) =>
  definePolicy<unknown, void>({ action, actor: [requireActiveAccount] });

export const searchObjectsPolicy = finnPolicy("search.objects");

export const searchEnvironmentsPolicy = finnPolicy("search.environments");

/** Name of the scheduled job that reconciles the whole search index. */
export const searchIndexProcess = "search_index.reconcile";

export const reconcileSearchIndexPolicy = definePolicy({
  action: "search_index.reconcile",
  actor: [requireSystemProcess(searchIndexProcess)],
});

export const searchPolicies = [
  searchObjectsPolicy,
  searchEnvironmentsPolicy,
  reconcileSearchIndexPolicy,
];
