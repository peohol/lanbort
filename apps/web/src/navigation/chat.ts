import type { ChatContext } from "@lanbort/contracts";

/**
 * The pages of private chat (WP-43). They get their own, stricter security
 * headers (ADR-0010 §13), so where they are is decided here, once.
 */
export const chatHref = "/samtaler";
export const chatDevicesHref = `${chatHref}/enheter`;
/** On an existing device: scan or type the code a new device shows. */
export const chatApproveLinkHref = `${chatDevicesHref}/koble`;
/** The same, starting with the field for the code instead of the camera. */
export const chatApproveByCodeHref = `${chatApproveLinkHref}?kode`;
/** On a new device: show the code and wait for approval. */
export const chatLinkHref = `${chatHref}/koble`;
/** Make the recovery key, or a new one (PS-COM-019). */
export const chatRecoveryKeyHref = `${chatDevicesHref}/gjenopprettingsnokkel`;
/** When no device with chat is left: restore it with the recovery key (R3). */
export const chatRestoreHref = `${chatHref}/gjenopprett`;
/** When no device with chat is left: start chat anew (ADR-0010 §8). */
export const chatResetHref = `${chatHref}/tilbakestill`;
/** «Logg ut» on a device with chat: what it loses, first (ADR-0010 §7). */
export const chatSignOutHref = `${chatHref}/logg-ut`;
export const chatConversationHref = (conversationId: string) =>
  `${chatHref}/${conversationId}`;
/**
 * Samtaler opened to write to someone (PS-COM-017): their conversation if
 * there is one, or else the offer to start it where the server allows it.
 */
export const chatWithHref = (userId: string, context?: ChatContext) =>
  `${chatHref}?${new URLSearchParams({
    med: userId,
    ...(context?.kind === "loan_request" && { foresporsel: context.requestId }),
    ...(context?.kind === "object_question" && {
      sporsmal: context.questionId,
    }),
  })}`;
/** «Om samtalen»: the loans, the security code and the personal choices. */
export const chatAboutHref = (conversationId: string) =>
  `${chatConversationHref(conversationId)}/om`;

/** Whether a path is one of the chat pages. */
export const isChatPage = (pathname: string) =>
  pathname === chatHref || pathname.startsWith(`${chatHref}/`);

/** Only the page that scans a link code may use the camera. */
export const usesCamera = (pathname: string) =>
  pathname === chatApproveLinkHref;
