import { previewLoanRequest } from "@lanbort/domain";
import { userQueryRoute } from "@/server/http/command-route";

/** `?objectId=&environmentId=`: what a request would be for, and the terms to confirm. */
export const GET = userQueryRoute(previewLoanRequest);
