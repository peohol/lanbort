import {
  type DeviceRef,
  type DeviceRevocation,
  verifyDeviceRevocation,
} from "./identity";
import { bytesEqual, fromBase64, toBase64 } from "./suite";

/**
 * What one device believes about other accounts (ADR-0010): the account key
 * it has pinned for each account, and the device revocations it has
 * verified. The server only delivers keys; it never decides what is trusted.
 * WP-43 persists this on the device; tests use the in-memory version.
 */
export interface TrustStore {
  accountKey(accountId: string): Uint8Array | undefined;
  setAccountKey(accountId: string, key: Uint8Array): void;
  isRevoked(device: DeviceRef): boolean;
  addRevocation(device: DeviceRef): void;
}

const deviceKey = ({ accountId, deviceId }: DeviceRef) =>
  JSON.stringify([accountId, deviceId]);

/** What a memory trust store holds, for the device's storage. */
export interface TrustSnapshot {
  accountKeys: Record<string, string>;
  revoked: string[];
}

/** A trust store in memory that can be saved and restored as a snapshot. */
export interface MemoryTrustStore extends TrustStore {
  snapshot(): TrustSnapshot;
}

export function createMemoryTrustStore(
  initial: TrustSnapshot = { accountKeys: {}, revoked: [] },
): MemoryTrustStore {
  const accountKeys = new Map<string, Uint8Array>(
    Object.entries(initial.accountKeys).map(([id, key]) => [
      id,
      fromBase64(key),
    ]),
  );
  const revoked = new Set<string>(initial.revoked);
  return {
    accountKey: (accountId) => accountKeys.get(accountId),
    setAccountKey: (accountId, key) => {
      accountKeys.set(accountId, key);
    },
    isRevoked: (device) => revoked.has(deviceKey(device)),
    addRevocation: (device) => {
      revoked.add(deviceKey(device));
    },
    snapshot: () => ({
      accountKeys: Object.fromEntries(
        [...accountKeys].map(([id, key]) => [id, toBase64(key)]),
      ),
      revoked: [...revoked],
    }),
  };
}

/**
 * - `pinned`: first time this account is seen; its key is now trusted.
 * - `unchanged`: matches the pinned key.
 * - `changed`: differs from the pinned key. Nothing is re-pinned; devices
 *   under the new key are rejected until the user has been told and
 *   `acceptChangedAccountKey` is called.
 */
export type AccountKeyObservation = "pinned" | "unchanged" | "changed";

export function observeAccountKey(
  trust: TrustStore,
  accountId: string,
  key: Uint8Array,
): AccountKeyObservation {
  const pinned = trust.accountKey(accountId);
  if (pinned === undefined) {
    trust.setAccountKey(accountId, key);
    return "pinned";
  }
  return bytesEqual(pinned, key) ? "unchanged" : "changed";
}

/** Only after the user has seen that the contact's security code changed. */
export function acceptChangedAccountKey(
  trust: TrustStore,
  accountId: string,
  key: Uint8Array,
): void {
  trust.setAccountKey(accountId, key);
}

/**
 * Records a revocation if it is signed by the account key this device has
 * pinned for that account. Returns whether it was recorded.
 */
export async function applyRevocation(
  trust: TrustStore,
  revocation: DeviceRevocation,
): Promise<boolean> {
  const pinned = trust.accountKey(revocation.accountId);
  if (
    pinned === undefined ||
    !bytesEqual(pinned, revocation.accountKey) ||
    !(await verifyDeviceRevocation(revocation))
  ) {
    return false;
  }
  trust.addRevocation(revocation);
  return true;
}
