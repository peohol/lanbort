import type { ChatConversationKind } from "@lanbort/contracts";

const minutes = 60 * 1000;
const days = 24 * 60 * minutes;

/**
 * How long the delivery service keeps what it holds (ADR-0010 §5, §6, §8).
 * Ciphertext is deleted as soon as every receiving device has fetched it;
 * these are the upper bounds for what is never fetched. They are technical
 * limits on undecryptable data, set short on purpose, and must be aligned
 * with the pilot's retention policy when OD-0002 is decided.
 */
export const chatRetention = {
  /** Undelivered ciphertext: a device away longer must be added again. */
  ciphertextMs: 30 * days,
  /** A key package is valid for 28 days on the device that made it. */
  keyPackageMs: 27 * days,
  /** A link request is used once, soon after it is shown. */
  linkRequestMs: 10 * minutes,
} as const;

/** At most this many unused key packages are kept per device. */
export const keyPackagesPerDevice = 100;

/**
 * What each kind of conversation allows (ADR-0010, «Hva de neste
 * arbeidspakkene trenger»). WP-44 adds the loan logistics channel here with
 * its own size limit and rules for when it is open.
 */
export interface ConversationKindRules {
  /** Largest application message the server accepts (ciphertext bytes). */
  readonly maxMessageBytes: number;
}

export const conversationKinds: Readonly<
  Record<ChatConversationKind, ConversationKindRules>
> = {
  private: { maxMessageBytes: 64 * 1024 },
};

/**
 * The MLS group id of a conversation's generation. A new generation is a
 * new group, so a restored server never mixes epochs with the old one.
 */
export const groupIdOf = (conversationId: string, generation: number) =>
  `${conversationId}:${generation}`;
