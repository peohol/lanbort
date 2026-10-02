import { withdrawObjectDeletionConsent } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";

export const POST = userPathCommandRoute(withdrawObjectDeletionConsent);
