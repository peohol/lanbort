import { describe, expect, it } from "vitest";
import {
  approveChatLink,
  claimChatKeyPackages,
  publishChatKeyPackages,
  registerChatAccount,
  requestChatLink,
  resetChatAccount,
  revokeChatDevice,
  sendChatMessage,
  startChatConversation,
  submitChatCommit,
} from "../chat";
import { createLoanRequest } from "../loans/commands";
import { previewLoanRequest } from "../loans/queries";
import {
  openEnvironmentContact,
  reportUnavailability,
  requestLoanMediation,
  writeCaseEntry,
} from "../cases/commands";
import {
  inviteMember,
  joinEnvironment,
} from "../environment/membership-commands";
import { getEnvironment } from "../environment/queries";
import {
  inviteAdministrator,
  offerOwnership,
} from "../environment/role-commands";
import { reportInEnvironment, reportToPlatform } from "../moderation/commands";
import { inviteCoOwner } from "../objects/co-owners";
import { listEnvironmentObjects } from "../publications/queries";
import {
  askObjectQuestion,
  replyToObjectQuestion,
} from "../questions/commands";
import { searchEnvironments, searchObjects } from "../search/queries";
import { sendFriendRequest } from "../social/commands";
import { getSocialRelation } from "../social/queries";
import { readTrustProfile } from "../trust/queries";
import { removeStewardPasskey } from "../platform/passkey-commands";
import { testPasskeyCommands } from "../testing/stewards";
import { rateLimits } from "./rate-limits";

/**
 * WP-73: which operations spend which budget. A new way to contact,
 * invite, report or look up others belongs in one of these lists.
 */
const limited = {
  contact: [
    sendFriendRequest,
    createLoanRequest,
    askObjectQuestion,
    replyToObjectQuestion,
    openEnvironmentContact,
    joinEnvironment,
    startChatConversation,
  ],
  invitations: [
    inviteMember,
    inviteAdministrator,
    offerOwnership,
    inviteCoOwner,
  ],
  reports: [reportInEnvironment, reportToPlatform, reportUnavailability],
  caseEntries: [writeCaseEntry, requestLoanMediation],
  lookups: [
    searchObjects,
    searchEnvironments,
    getEnvironment,
    listEnvironmentObjects,
    readTrustProfile,
    getSocialRelation,
    previewLoanRequest,
  ],
  chatMessages: [sendChatMessage, submitChatCommit],
  chatKeys: [
    registerChatAccount,
    requestChatLink,
    approveChatLink,
    revokeChatDevice,
    publishChatKeyPackages,
    claimChatKeyPackages,
  ],
  chatResets: [resetChatAccount],
  passkeys: [...Object.values(testPasskeyCommands), removeStewardPasskey],
} as const;

describe("rate limits", () => {
  it.each(Object.entries(limited))(
    "%s operations share their budget",
    (name, operations) => {
      for (const operation of operations) {
        expect(operation.rateLimit, operation.name).toBe(
          rateLimits[name as keyof typeof limited],
        );
      }
    },
  );

  it("names every rule uniquely, as the database accepts", () => {
    const rules = Object.values(rateLimits).map(({ rule }) => rule);

    expect(new Set(rules).size).toBe(rules.length);
    for (const { rule, limit, windowSeconds } of Object.values(rateLimits)) {
      expect(rule).toMatch(/^[a-z][a-z0-9_]*$/);
      expect(Number.isInteger(limit) && limit > 0).toBe(true);
      expect(windowSeconds).toBeGreaterThan(0);
    }
  });
});
