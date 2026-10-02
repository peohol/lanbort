import { withdrawOwnershipClaim } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** Withdraws the caller's interest in a vacant ownership. */
export const POST = userCommandRoute(withdrawOwnershipClaim);
