import { DomainError } from "../errors";

/**
 * The few plaintext fields of an MLS message (RFC 9420 §6) the delivery
 * service needs to decide on: which group and epoch a message is for, and
 * whether it is an application message or a commit. Everything else is
 * ciphertext the server cannot and does not read. Parsing is strict, so a
 * client cannot make the server order one thing while delivering another.
 */

/** RFC 9420's mandatory suite, the only one Lånbort uses (ADR-0010 §1). */
const ciphersuite = 0x0001;
/** The suite's AEAD (AES-128-GCM) adds this tag to every ciphertext. */
const aeadTagBytes = 16;
const mls10 = 0x0001;

const wireformats = {
  privateMessage: 2,
  welcome: 3,
  keyPackage: 5,
} as const;

const contentTypes = new Map<number, "application" | "commit">([
  [1, "application"],
  [3, "commit"],
]);

class Reader {
  #offset = 0;

  constructor(private readonly bytes: Uint8Array) {}

  uint8(): number {
    if (this.#offset >= this.bytes.length) invalid();
    return this.bytes[this.#offset++]!;
  }

  uint16(): number {
    return (this.uint8() << 8) | this.uint8();
  }

  uint64(): bigint {
    let value = 0n;
    for (let i = 0; i < 8; i++) value = (value << 8n) | BigInt(this.uint8());
    return value;
  }

  /** A variable-length vector (RFC 9420 §2.1.2). */
  vector(): Uint8Array {
    const first = this.uint8();
    const prefix = first >> 6;
    let length = first & 0x3f;

    if (prefix === 3) invalid();
    for (let i = 0; i < (prefix === 0 ? 0 : prefix === 1 ? 1 : 3); i++) {
      length = length * 256 + this.uint8();
    }

    const end = this.#offset + length;
    if (end > this.bytes.length) invalid();
    const value = this.bytes.subarray(this.#offset, end);
    this.#offset = end;
    return value;
  }

  done(): void {
    if (this.#offset !== this.bytes.length) invalid();
  }
}

function invalid(): never {
  throw new DomainError("invalid_input", "Not a valid MLS message");
}

function header(bytes: Uint8Array, wireformat: number): Reader {
  const reader = new Reader(bytes);

  if (reader.uint16() !== mls10 || reader.uint16() !== wireformat) {
    invalid();
  }

  return reader;
}

export interface PrivateMessageHeader {
  readonly groupId: string;
  readonly epoch: bigint;
  readonly contentType: "application" | "commit";
  /**
   * How long the encrypted content is once decrypted, padding included: a
   * message that fits in one padding block is exactly one block long. The
   * server learns no more than the ciphertext's length already shows.
   */
  readonly contentBytes: number;
}

/**
 * An MLS private message. Proposals on their own are refused: changes come
 * only as commits (ADR-0010 §4).
 */
export function readPrivateMessage(bytes: Uint8Array): PrivateMessageHeader {
  const reader = header(bytes, wireformats.privateMessage);
  const groupId = reader.vector();
  const epoch = reader.uint64();
  const contentType = contentTypes.get(reader.uint8());
  reader.vector(); // authenticated data
  reader.vector(); // encrypted sender data
  const contentBytes = reader.vector().length - aeadTagBytes;
  reader.done();

  if (!contentType || contentBytes < 0) invalid();

  let group: string;
  try {
    group = new TextDecoder("utf-8", { fatal: true }).decode(groupId);
  } catch {
    invalid();
  }

  return { groupId: group, epoch, contentType, contentBytes };
}

/** An MLS welcome in Lånbort's ciphersuite. Its content is all ciphertext. */
export function readWelcome(bytes: Uint8Array): void {
  const reader = header(bytes, wireformats.welcome);

  if (reader.uint16() !== ciphersuite) invalid();
  reader.vector(); // encrypted group secrets
  reader.vector(); // encrypted group info
  reader.done();
}

export interface KeyPackageIdentity {
  /** The device signature key the package is signed with. */
  readonly signatureKey: Uint8Array;
  /** The basic credential's identity: the device certificate. */
  readonly identity: Uint8Array;
}

/**
 * An MLS key package in Lånbort's ciphersuite, read up to its credential,
 * so the server only keeps packages a device publishes for itself.
 */
export function readKeyPackage(bytes: Uint8Array): KeyPackageIdentity {
  const reader = header(bytes, wireformats.keyPackage);

  if (reader.uint16() !== mls10 || reader.uint16() !== ciphersuite) {
    invalid();
  }

  reader.vector(); // init key
  reader.vector(); // leaf encryption key
  const signatureKey = reader.vector();

  // Basic credentials only (ADR-0010 §3).
  if (reader.uint16() !== 1) invalid();

  return { signatureKey, identity: reader.vector() };
}
