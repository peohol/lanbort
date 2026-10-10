import { closeCase } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/**
 * `{ body? }`: a handler closes the case, a report or mediation with its
 * closing message (PS-COM-020); it decides nothing about the loan or account.
 */
export const POST = userCommandRoute(closeCase);
