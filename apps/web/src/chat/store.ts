"use client";

/**
 * The device's chat storage (ADR-0010 §10): keys, group state and the
 * history read on this device, in IndexedDB, each record encrypted with a
 * non-extractable AES-GCM key that never leaves the browser. Deleting the
 * database deletes the key with it, so the device's chat is gone for good.
 * This does not protect against code running in the app itself (§13).
 */

const version = 1;
const records = "records";
const meta = "meta";
const keyName = "key";

/** One browser can hold the chat of more than one account, one each. */
const databasePrefix = "lanbort-chat-";
const databaseName = (userId: string) => `${databasePrefix}${userId}`;

interface SealedRecord {
  iv: Uint8Array<ArrayBuffer>;
  data: ArrayBuffer;
}

/**
 * Encrypts one record. The record's name is authenticated with it, so a
 * record cannot be passed off as another.
 */
export async function sealRecord(
  key: CryptoKey,
  name: string,
  plaintext: Uint8Array<ArrayBuffer>,
): Promise<SealedRecord> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(name) },
    key,
    plaintext,
  );
  return { iv, data };
}

export async function openRecord(
  key: CryptoKey,
  name: string,
  sealed: SealedRecord,
): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: sealed.iv,
        additionalData: new TextEncoder().encode(name),
      },
      key,
      sealed.data,
    ),
  );
}

export const createStorageKey = () =>
  crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);

const request = <T>(req: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

async function openDatabase(name: string): Promise<IDBDatabase> {
  const open = indexedDB.open(name, version);
  open.onupgradeneeded = () => {
    open.result.createObjectStore(records);
    open.result.createObjectStore(meta);
  };
  const db = await request(open);
  // Lets go when the database is deleted elsewhere, which would otherwise
  // wait for this connection.
  db.onversionchange = () => db.close();
  return db;
}

export interface ChatStore {
  get(name: string): Promise<Uint8Array<ArrayBuffer> | undefined>;
  put(name: string, value: Uint8Array<ArrayBuffer>): Promise<void>;
  getJson<T>(name: string): Promise<T | undefined>;
  putJson(name: string, value: unknown): Promise<void>;
  delete(name: string): Promise<void>;
  /** The names of the records that start with `prefix`. */
  names(prefix: string): Promise<string[]>;
  /** Deletes this device's chat: every record and the key. */
  destroy(): Promise<void>;
}

/** Whether this browser holds chat for the account, without creating it. */
export async function hasChatStore(userId: string): Promise<boolean> {
  if (typeof indexedDB.databases !== "function") return true;
  return (await indexedDB.databases()).some(
    (database) => database.name === databaseName(userId),
  );
}

export async function deleteChatStore(userId: string): Promise<void> {
  await request(indexedDB.deleteDatabase(databaseName(userId)));
}

/**
 * Deletes the chat of every account this browser holds, at sign-out
 * (ADR-0010 §7): no account is signed in afterwards, and a device's chat
 * only ever works in the sign-in it was made in. Where the browser cannot
 * list its databases, there is nothing to find them by.
 */
export async function deleteAllChatStores(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  if (typeof indexedDB.databases !== "function") return;
  const names = (await indexedDB.databases()).flatMap(({ name }) =>
    name?.startsWith(databasePrefix) ? [name] : [],
  );
  await Promise.all(
    names.map((name) => request(indexedDB.deleteDatabase(name))),
  );
}

export async function openChatStore(userId: string): Promise<ChatStore> {
  const name = databaseName(userId);
  const db = await openDatabase(name);

  let key = (await request(
    db.transaction(meta).objectStore(meta).get(keyName),
  )) as CryptoKey | undefined;
  if (!key) {
    // Generating the key is asynchronous and would end the transaction, so
    // the first device writes it in its own; a second writer loses to `add`.
    key = await createStorageKey();
    const write = db.transaction(meta, "readwrite");
    write.objectStore(meta).add(key, keyName);
    await finished(write).catch(async () => {
      key = (await request(
        db.transaction(meta).objectStore(meta).get(keyName),
      )) as CryptoKey;
    });
  }
  const storageKey = key;

  const store: ChatStore = {
    async get(recordName) {
      const sealed = (await request(
        db.transaction(records).objectStore(records).get(recordName),
      )) as SealedRecord | undefined;
      return sealed && openRecord(storageKey, recordName, sealed);
    },
    async put(recordName, value) {
      const sealed = await sealRecord(storageKey, recordName, value);
      const tx = db.transaction(records, "readwrite");
      tx.objectStore(records).put(sealed, recordName);
      await finished(tx);
    },
    async getJson<T>(recordName: string) {
      const bytes = await store.get(recordName);
      return bytes && (JSON.parse(new TextDecoder().decode(bytes)) as T);
    },
    putJson: (recordName, value) =>
      store.put(recordName, new TextEncoder().encode(JSON.stringify(value))),
    async delete(recordName) {
      const tx = db.transaction(records, "readwrite");
      tx.objectStore(records).delete(recordName);
      await finished(tx);
    },
    async names(prefix) {
      const keys = await request(
        db
          .transaction(records)
          .objectStore(records)
          .getAllKeys(IDBKeyRange.bound(prefix, `${prefix}￿`)),
      );
      return keys.map(String);
    },
    async destroy() {
      db.close();
      await deleteChatStore(userId);
    },
  };
  return store;
}
