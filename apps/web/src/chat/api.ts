"use client";

import type {
  ChatArchive,
  ChatClaimedKeyPackages,
  ChatConversation,
  ChatConversationList,
  ChatDirectory,
  ChatInbox,
  ChatLinkRequest,
  ChatLinkStatus,
  ChatRecoveryBackup,
  CreateChatArchive,
  DeviceCertificateWire,
  DeviceRevocationWire,
  OwnChatDevices,
} from "@lanbort/contracts";
import {
  type ApiFailureCode,
  type ApiResult,
  getJson,
  postJson,
} from "@/components/api-client";

/** A chat call that failed, with the API's code. */
export class ChatApiError extends Error {
  constructor(readonly code: ApiFailureCode) {
    super(`chat call failed: ${code}`);
  }
}

const unwrap = <T>(result: ApiResult<T>): T => {
  if (!result.ok) throw new ChatApiError(result.code);
  return result.data;
};

const get = async <T>(path: string) => unwrap(await getJson<T>(path));

/**
 * A chat change that got no answer is sent once more with the same
 * idempotency key, so it takes effect only once; a caller that tries again
 * later passes the same key. `harmless` changes (the inbox receipt) take no
 * key and are simply repeated.
 */
async function post<T>(
  path: string,
  body: unknown,
  {
    harmless = false,
    idempotencyKey = crypto.randomUUID(),
  }: { harmless?: boolean; idempotencyKey?: string } = {},
): Promise<T> {
  const options = harmless ? {} : { idempotencyKey };
  let result = await postJson<T>(path, body, options);
  if (!result.ok && result.code === "network") {
    result = await postJson<T>(path, body, options);
  }
  return unwrap(result);
}

const conversation = (id: string) => `/api/chat/conversations/${id}`;
const archive = (id: string) => `/api/chat/archives/${id}`;

/** The chat API (`app/api/chat`): public keys and ciphertext only. */
export const chatApi = {
  devices: () => get<OwnChatDevices>("/api/chat/devices"),
  register: (
    body: { accountKey: string; certificate: DeviceCertificateWire },
    reset = false,
  ) =>
    post<{ deviceId: string }>(
      reset ? "/api/chat/account/reset" : "/api/chat/account",
      body,
    ),
  revoke: (revocation: DeviceRevocationWire) =>
    post("/api/chat/devices/revoke", { revocation }),
  publishKeyPackages: (body: { keyPackages: string[]; lastResort?: string }) =>
    post<{ available: number; lastResort: boolean }>(
      "/api/chat/key-packages",
      body,
    ),

  requestLink: (body: {
    deviceId: string;
    deviceKey: string;
    linkKey: string;
    commitment: string;
  }) => post<ChatLinkStatus>("/api/chat/links", body),
  linkStatus: (id: string) => get<ChatLinkStatus>(`/api/chat/links/${id}`),
  finishLink: (id: string) => post(`/api/chat/links/${id}/finish`, {}),
  linkRequests: () => get<{ requests: ChatLinkRequest[] }>("/api/chat/links"),
  approveLink: (
    id: string,
    body: { certificate: DeviceCertificateWire; package: string },
  ) => post(`/api/chat/links/${id}/approve`, body),

  /** History archives, for a device being linked or the backup (ADR-0010 §5, §8). */
  createArchive: (body: CreateChatArchive) =>
    post<ChatArchive>("/api/chat/archives", body),
  putArchivePart: (id: string, part: number, data: string) =>
    post<{ complete: boolean }>(`${archive(id)}/parts/${part}`, { data }),
  archivePart: (id: string, part: number) =>
    get<{ data: string }>(`${archive(id)}/parts/${part}`),
  deleteArchive: (id: string) => post(`${archive(id)}/delete`, {}),

  /** The recovery key's backup (ADR-0010 §8, PS-COM-019). */
  createRecoveryKey: (body: { keyId: string; backup: string }) =>
    post("/api/chat/recovery", body),
  backUp: (body: { keyId: string; backup: string; archiveId: string }) =>
    post("/api/chat/recovery/backup", body),
  recoveryBackup: () => get<ChatRecoveryBackup>("/api/chat/recovery"),
  restore: (body: {
    certificate: DeviceCertificateWire;
    revocations: DeviceRevocationWire[];
  }) => post<{ deviceId: string }>("/api/chat/account/restore", body),
  answerRecoveryPrompt: (prompt: "offer" | "reminder") =>
    post("/api/chat/recovery/prompt", { prompt }),

  conversations: () => get<ChatConversationList>("/api/chat/conversations"),
  start: (body: {
    userId: string;
    context?:
      | { kind: "loan_request"; requestId: string }
      | { kind: "object_question"; questionId: string };
  }) => post<{ conversationId: string }>("/api/chat/conversations", body),
  /** A loan logistics channel's own conversation (WP-44); the same one again. */
  startLoanLogistics: (channelId: string, idempotencyKey: string) =>
    post<{ conversationId: string }>(
      `/api/chat/loan-logistics/${channelId}`,
      {},
      { idempotencyKey },
    ),
  conversation: (id: string) => get<ChatConversation>(conversation(id)),
  directory: (id: string) =>
    get<ChatDirectory>(`${conversation(id)}/directory`),
  hide: (id: string) => post(`${conversation(id)}/hide`, {}),
  mute: (id: string, muted: boolean) =>
    post(`${conversation(id)}/mute`, { muted }),
  /** Opened: its notification of new messages is read (PS-COM-018). */
  readNotifications: (id: string) =>
    post(`${conversation(id)}/notifications/read`, {}, { harmless: true }),
  claimKeyPackages: (id: string) =>
    post<ChatClaimedKeyPackages>(`${conversation(id)}/key-packages`, {}),
  commit: (
    id: string,
    body: {
      generation: number;
      commit: string;
      welcome: string | null;
      addedDeviceIds: string[];
      removedDeviceIds: string[];
    },
    idempotencyKey: string,
  ) =>
    post<{ generation: number; epoch: number }>(
      `${conversation(id)}/commits`,
      { conversationId: id, ...body },
      { idempotencyKey },
    ),
  send: (id: string, body: { generation: number; ciphertext: string }) =>
    post<{ position: string | null; sentAt: string }>(
      `${conversation(id)}/messages`,
      { conversationId: id, ...body },
    ),

  inbox: () => get<ChatInbox>("/api/chat/inbox"),
  acknowledge: (positions: string[]) =>
    post("/api/chat/inbox/acknowledge", { positions }, { harmless: true }),
};
