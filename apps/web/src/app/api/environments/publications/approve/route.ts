import { approvePublication } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

/** An administrator approves a publication, or changes a rejection (PS-ENV-011). */
export const POST = userCommandRoute(approvePublication);
