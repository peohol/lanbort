import { startLoanLogisticsChat } from "@lanbort/domain";
import { userPathCommandRoute } from "@/server/http/command-route";
import { chatOnly } from "@/server/http/chat-gate";

/**
 * The encrypted conversation of a loan logistics channel (WP-44), for
 * either of its two people; the same one whoever asks again.
 */
export const POST = chatOnly(userPathCommandRoute(startLoanLogisticsChat));
