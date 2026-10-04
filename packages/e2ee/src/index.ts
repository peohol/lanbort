/**
 * Client-side end-to-end encryption for private chat (ADR-0010). Runs only on
 * the user's device; the server never imports this package, because it never
 * holds a key that could decrypt private messages.
 */
export {
  type ConversationPolicy,
  type KeyPackageBundle,
  type PendingCommit,
  type Received,
  Conversation,
  KEY_PACKAGE_LIFETIME_SECONDS,
  conversationAuthenticator,
  createKeyPackage,
  currentlyTrusted,
} from "./conversation";
export {
  type AccountKey,
  type Device,
  type DeviceCertificate,
  type DeviceKey,
  type DeviceRef,
  type DeviceRevocation,
  certifyDevice,
  createAccountKey,
  createDevice,
  createDeviceKey,
  decodeCertificate,
  decodeRevocation,
  encodeCertificate,
  encodeRevocation,
  revokeDevice,
  verifyDeviceCertificate,
  verifyDeviceRevocation,
} from "./identity";
export {
  type LinkRequestKeys,
  type PendingLink,
  approveLink,
  linkCode,
  matchLinkRequest,
  normalizeLinkCode,
  readLinkQr,
  startLink,
} from "./linking";
export {
  exportAccountKey,
  exportDevice,
  exportKeyPackage,
  importAccountKey,
  importDevice,
  importKeyPackage,
} from "./persist";
export { type AccountIdentity, securityCode } from "./safety";
export { Secret, wipe } from "./secret";
export { CIPHERSUITE } from "./suite";
export {
  type AccountKeyObservation,
  type MemoryTrustStore,
  type TrustSnapshot,
  type TrustStore,
  acceptChangedAccountKey,
  applyRevocation,
  createMemoryTrustStore,
  observeAccountKey,
} from "./trust";
