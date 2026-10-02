import { declineCoOwnerInvitation } from "@lanbort/domain";
import { userCommandRoute } from "@/server/http/command-route";

export const POST = userCommandRoute(declineCoOwnerInvitation);
