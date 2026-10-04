/**
 * The pages of private chat (WP-43). They get their own, stricter security
 * headers (ADR-0010 §13), so where they are is decided here, once.
 */
export const chatHref = "/samtaler";
export const chatDevicesHref = `${chatHref}/enheter`;
/** On an existing device: scan or type the code a new device shows. */
export const chatApproveLinkHref = `${chatDevicesHref}/koble`;
/** On a new device: show the code and wait for approval. */
export const chatLinkHref = `${chatHref}/koble`;
export const chatConversationHref = (conversationId: string) =>
  `${chatHref}/${conversationId}`;

/** Whether a path is one of the chat pages. */
export const isChatPage = (pathname: string) =>
  pathname === chatHref || pathname.startsWith(`${chatHref}/`);

/** Only the page that scans a link code may use the camera. */
export const usesCamera = (pathname: string) =>
  pathname === chatApproveLinkHref;
