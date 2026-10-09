import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { UserActor } from "../actor";
import {
  acceptRoleInvitation,
  approveLoanRequest,
  askObjectQuestion,
  blockUser,
  claimCase,
  evaluateActor,
  executeQuery,
  inviteAdministrator,
  inviteCoOwner,
  inviteMember,
  leaveEnvironment,
  leaveObject,
  listPlatformCaseQueue,
  offerResponsibility,
  openEnvironmentContact,
  type Policy,
  proposeLoanAmendment,
  publishObject,
  publishToFriends,
  reportHandover,
  reportToPlatform,
  registerChatAccount,
  reportUnavailability,
  requestChatLink,
  requestLoanMediation,
  resolveUserActor,
  setObjectRestriction,
  readLoanLogistics,
  startChatConversation,
  transferCase,
  uploadObjectImage,
  uploadProfilePicture,
} from "../index";
import { testChatAccount, testChatDevice } from "../testing/chat";
import { connectTestDatabase } from "../testing/database";
import { registerTestUser } from "../testing/identities";
import { loanTestKit } from "../testing/loans";
import {
  allOperations,
  attempt,
  type Operation,
  type Outcome,
  reachableByUsers,
} from "../testing/operations";

/**
 * WP-70: the authorization and privacy security test that quality gate D
 * needs, aimed at the pilot as it is built. Where each feature tests its own
 * rules, this suite takes the attacker's side across all of them: hidden
 * environments, historical access, co-owner boundaries, conflict of
 * interest, representatives and privileged platform access.
 */
const db = connectTestDatabase();
afterAll(() => db.destroy());
vi.setConfig({ testTimeout: 60_000 });

// No scheduled job runs here, and the clock starts beyond where the files
// that run them move theirs, so no job acts on this file's loans.
const kit = loanTestKit(db, { startInDays: 1100 });
const {
  run,
  user,
  environment,
  member,
  create,
  addCoOwner,
  environmentOrigin,
  ask,
  day,
  dated,
} = kit;

/** Input properties that name a resource someone may not be allowed to see. */
const resourceKeys = new Set([
  "environmentId",
  "objectId",
  "publicationId",
  "membershipId",
  "invitationId",
  "proposalId",
  "requestId",
  "loanId",
  "amendmentId",
  "transferId",
  "reportId",
  "restrictionId",
  "imageId",
  "caseId",
  "correctsEntryId",
  "questionId",
  "notificationId",
  "notificationIds",
  "through",
  "conversationId",
  "linkRequestId",
  "channelId",
  "pictureId",
]);

/** The probes ask the images' read policies; their files are never read. */
const noFiles = {
  store: {
    put: async () => {},
    get: async () => null,
    remove: async () => {},
  },
  process: async (bytes: Uint8Array) => ({
    bytes,
    contentType: "image/webp" as const,
    width: 10,
    height: 10,
  }),
};

/**
 * A hidden environment with everything that can live in it: members (one
 * with a profile picture), an object with a co-owner, its publication, a loan with an amendment and a
 * responsibility offer waiting, pending invitations, a case, a question,
 * the lender's chat with the borrower, a pending chat device link, and the
 * loan's logistics channel once the borrower has blocked the lender.
 */
async function hiddenWorld() {
  // A name no other test uses, to look for in everything an outsider reads.
  const name = `Skjult ${randomUUID().slice(0, 8)}`;
  const admin = await user();
  const environmentId = await environment(admin, {
    name,
    description: name,
    type: "hidden",
  });
  const lender = await member(environmentId, admin);
  const borrower = await member(environmentId, admin);
  const coOwner = await member(environmentId, admin);
  const other = await member(environmentId, admin);

  const objectId = await create(lender, "Må vaskes etter bruk.");
  await addCoOwner(lender, objectId, coOwner);
  const { imageId } = (
    await uploadObjectImage(kit.tick(), noFiles, {
      actor: lender,
      objectId,
      bytes: new TextEncoder().encode(randomUUID()),
      idempotencyKey: randomUUID(),
    })
  ).output;
  const { pictureId } = (
    await uploadProfilePicture(kit.tick(), noFiles, {
      actor: other,
      bytes: new TextEncoder().encode(randomUUID()),
      idempotencyKey: randomUUID(),
    })
  ).output;
  const { publicationId } = await run(publishObject, lender, {
    objectId,
    environmentId,
  });
  // Visible to the lender's friends too, none of whom is in the world.
  await run(publishToFriends, lender, { objectId });
  const privateObjectId = await create(lender);
  const { invitationId: coOwnerInvitationId } = await run(
    inviteCoOwner,
    lender,
    { objectId: privateObjectId, userId: other.userId },
  );
  const { restrictionId } = await run(setObjectRestriction, coOwner, {
    objectId,
    period: { start: day(20), end: day(25) },
  });

  const invitee = await user();
  const { membershipId } = await run(inviteMember, admin, {
    environmentId,
    userId: invitee.userId,
  });
  const { invitationId: roleInvitationId } = await run(
    inviteAdministrator,
    admin,
    { environmentId, userId: other.userId },
  );

  const { requestId } = await ask(
    borrower,
    objectId,
    environmentOrigin(environmentId),
    dated(2, 4),
  );
  const { loanId } = await run(approveLoanRequest, lender, { requestId });
  const { amendmentId } = await run(proposeLoanAmendment, borrower, {
    loanId,
    agreementVersion: 1,
    period: { start: day(3), end: day(5) },
  });
  const { transferId } = await run(offerResponsibility, lender, {
    loanId,
    toUserId: coOwner.userId,
  });

  const { caseId } = await run(openEnvironmentContact, other, {
    environmentId,
    body: "Hei, kan dere se på reglene?",
  });
  const { questionId } = await run(askObjectQuestion, other, {
    environmentId,
    objectId,
    body: "Passer den til en liten bil?",
  });

  const chatAccount = testChatAccount(lender.userId);
  await run(registerChatAccount, lender, {
    accountKey: chatAccount.accountKey,
    certificate: testChatDevice(chatAccount).certificate,
  });
  const { conversationId } = await run(startChatConversation, lender, {
    userId: borrower.userId,
    context: { kind: "loan_request", requestId },
  });
  const linking = testChatDevice(chatAccount);
  const { linkRequestId } = await run(
    requestChatLink,
    {
      ...lender,
      authentication: { ...lender.authentication, sessionId: randomUUID() },
    },
    {
      deviceId: linking.deviceId,
      deviceKey: linking.deviceKey,
      linkKey: linking.deviceKey,
    },
  );

  await run(blockUser, borrower, { userId: lender.userId });
  const { channels } = await executeQuery(kit.tick(), readLoanLogistics, {
    actor: lender,
    input: { loanId },
  });
  const channelId = channels[0]!.id;

  return {
    name,
    actors: { admin, lender, borrower, coOwner, other, invitee },
    ids: {
      environmentId,
      objectId,
      privateObjectId,
      publicationId,
      membershipId,
      roleInvitationId,
      coOwnerInvitationId,
      proposalId: randomUUID(),
      requestId,
      loanId,
      amendmentId,
      transferId,
      // The loan is not handed over, so it has no report of damage yet.
      reportId: randomUUID(),
      restrictionId,
      imageId,
      pictureId: pictureId!,
      caseId,
      questionId,
      conversationId,
      linkRequestId,
      channelId,
      notificationId: randomUUID(),
      userId: other.userId,
    },
  };
}

type World = Awaited<ReturnType<typeof hiddenWorld>>;
type WorldIds = World["ids"];

/**
 * The answer as the client gets it, with what the caller sent in left out,
 * so an answer that only echoes the input compares equal.
 */
function withoutEcho(outcome: Outcome, input: object) {
  const sent = JSON.stringify(input).match(/"[^"]*"/g) ?? [];

  return sent.reduce(
    (json, value) => json.replaceAll(value, '"<sent>"'),
    JSON.stringify(outcome),
  );
}

/** The same world with every id replaced by one that names nothing. */
const nowhere = (ids: WorldIds): WorldIds =>
  Object.fromEntries(
    Object.keys(ids).map((key) => [key, randomUUID()]),
  ) as WorldIds;

const text = "Dette er en melding.";

/**
 * Someone outside every world, whom a chat probe names as the other
 * person, and a device certificate of theirs to approve a link with.
 */
let bystander: UserActor;
const bystanderAccount = testChatAccount(randomUUID());
const bystanderDevice = testChatDevice(bystanderAccount);
beforeAll(async () => {
  bystander = await user();
});

/**
 * A valid input for every operation that names a resource, built from the
 * world's ids. The coverage test below fails when an operation is missing,
 * so a new one is probed as soon as it exists.
 */
const probes: Record<string, (ids: WorldIds) => object> = {
  // Environments
  "environment.read": (ids) => ({ environmentId: ids.environmentId }),
  "environment_membership.list": (ids) => ({
    environmentId: ids.environmentId,
  }),
  "environment.list_roles": (ids) => ({ environmentId: ids.environmentId }),
  "environment_member.list": (ids) => ({ environmentId: ids.environmentId }),
  "environment.update_details": (ids) => ({
    environmentId: ids.environmentId,
    name: "Nytt navn",
    expectedVersion: 1,
  }),
  "environment.update_requirements": (ids) => ({
    environmentId: ids.environmentId,
    requirements: [],
    expectedRevision: 0,
  }),
  "environment.lift_restriction": (ids) => ({
    environmentId: ids.environmentId,
    restrictionId: ids.restrictionId,
  }),
  "environment.lift_concealed_restrictions": (ids) => ({
    environmentId: ids.environmentId,
  }),
  "environment.change_type": (ids) => ({
    environmentId: ids.environmentId,
    type: "closed",
    expectedType: "hidden",
  }),
  "environment.withdraw_type_change": (ids) => ({
    environmentId: ids.environmentId,
    proposalId: ids.proposalId,
  }),
  "environment_membership.respond_to_type_change": (ids) => ({
    environmentId: ids.environmentId,
    proposalId: ids.proposalId,
    support: true,
  }),
  "environment_membership.join": (ids) => ({
    environmentId: ids.environmentId,
    answers: [],
  }),
  "environment_membership.submit_answers": (ids) => ({
    environmentId: ids.environmentId,
    answers: [],
  }),
  "environment_membership.accept_invitation": (ids) => ({
    environmentId: ids.environmentId,
    answers: [],
  }),
  "environment_membership.leave": (ids) => ({
    environmentId: ids.environmentId,
  }),
  "environment_membership.invite": (ids) => ({
    environmentId: ids.environmentId,
    userId: ids.userId,
  }),
  "environment_membership.approve": (ids) => ({
    environmentId: ids.environmentId,
    membershipId: ids.membershipId,
  }),
  "environment_membership.reject": (ids) => ({
    environmentId: ids.environmentId,
    membershipId: ids.membershipId,
  }),
  "environment_membership.request_information": (ids) => ({
    environmentId: ids.environmentId,
    membershipId: ids.membershipId,
  }),
  "environment_membership.withdraw_invitation": (ids) => ({
    environmentId: ids.environmentId,
    membershipId: ids.membershipId,
  }),
  "environment.invite_administrator": (ids) => ({
    environmentId: ids.environmentId,
    userId: ids.userId,
  }),
  "environment.offer_ownership": (ids) => ({
    environmentId: ids.environmentId,
    userId: ids.userId,
  }),
  "environment.accept_role_invitation": (ids) => ({
    environmentId: ids.environmentId,
    invitationId: ids.roleInvitationId,
  }),
  "environment.decline_role_invitation": (ids) => ({
    environmentId: ids.environmentId,
    invitationId: ids.roleInvitationId,
  }),
  "environment.withdraw_role_invitation": (ids) => ({
    environmentId: ids.environmentId,
    invitationId: ids.roleInvitationId,
  }),
  "environment.remove_administrator": (ids) => ({
    environmentId: ids.environmentId,
    userId: ids.userId,
  }),
  "environment.resign_administrator": (ids) => ({
    environmentId: ids.environmentId,
  }),
  "environment.claim_ownership": (ids) => ({
    environmentId: ids.environmentId,
  }),
  "environment.withdraw_ownership_claim": (ids) => ({
    environmentId: ids.environmentId,
  }),
  "environment.start_wind_down": (ids) => ({
    environmentId: ids.environmentId,
  }),
  "environment.cancel_wind_down": (ids) => ({
    environmentId: ids.environmentId,
  }),
  "environment.set_object_approval": (ids) => ({
    environmentId: ids.environmentId,
    required: true,
  }),

  // Publications, discovery and interest
  "environment_publication.publish": (ids) => ({
    objectId: ids.privateObjectId,
    environmentId: ids.environmentId,
  }),
  "environment_publication.withdraw": (ids) => ({
    objectId: ids.objectId,
    publicationId: ids.publicationId,
  }),
  "environment_publication.approve": (ids) => ({
    environmentId: ids.environmentId,
    publicationId: ids.publicationId,
  }),
  "environment_publication.reject": (ids) => ({
    environmentId: ids.environmentId,
    publicationId: ids.publicationId,
  }),
  "environment_publication.block": (ids) => ({
    environmentId: ids.environmentId,
    publicationId: ids.publicationId,
  }),
  "environment_publication.unblock": (ids) => ({
    environmentId: ids.environmentId,
    publicationId: ids.publicationId,
  }),
  "environment_publication.list_for_environment": (ids) => ({
    environmentId: ids.environmentId,
  }),
  "environment_publication.list_for_object": (ids) => ({
    objectId: ids.objectId,
  }),
  "environment_object.list": (ids) => ({ environmentId: ids.environmentId }),
  "environment_object.read_image": (ids) => ({
    environmentId: ids.environmentId,
    objectId: ids.objectId,
    imageId: ids.imageId,
  }),
  "friend_publication.publish": (ids) => ({ objectId: ids.objectId }),
  "friend_publication.withdraw": (ids) => ({ objectId: ids.objectId }),
  "friend_object.read_image": (ids) => ({
    objectId: ids.objectId,
    imageId: ids.imageId,
  }),
  "search.objects": (ids) => ({
    environmentId: ids.environmentId,
    categoryId: "annet",
  }),
  "object_question.ask": (ids) => ({
    environmentId: ids.environmentId,
    objectId: ids.objectId,
    body: text,
  }),
  "object_question.reply": (ids) => ({
    questionId: ids.questionId,
    body: text,
  }),
  "object_question.list": (ids) => ({
    environmentId: ids.environmentId,
    objectId: ids.objectId,
  }),
  "object_question.read": (ids) => ({ questionId: ids.questionId }),
  "object_subscription.subscribe": (ids) => ({ objectId: ids.objectId }),
  "object_subscription.unsubscribe": (ids) => ({ objectId: ids.objectId }),

  // Objects
  "object.read": (ids) => ({ objectId: ids.objectId }),
  "object.read_history": (ids) => ({ objectId: ids.objectId }),
  "profile_picture.read": (ids) => ({ pictureId: ids.pictureId }),
  "object.read_image": (ids) => ({
    objectId: ids.objectId,
    imageId: ids.imageId,
  }),
  "object.update": (ids) => ({
    objectId: ids.objectId,
    expectedVersion: 1,
    title: "Ny tittel",
  }),
  "object.revert": (ids) => ({
    objectId: ids.objectId,
    version: 1,
    expectedVersion: 2,
  }),
  "object.archive": (ids) => ({ objectId: ids.objectId }),
  "object.restore": (ids) => ({ objectId: ids.objectId }),
  "object.add_image": (ids) => ({
    objectId: ids.objectId,
    imageId: ids.imageId,
    byteSize: 1000,
    width: 100,
    height: 100,
  }),
  "object.remove_image": (ids) => ({
    objectId: ids.objectId,
    imageId: ids.imageId,
  }),
  "object.invite_co_owner": (ids) => ({
    objectId: ids.objectId,
    userId: ids.userId,
  }),
  "object.withdraw_co_owner_invitation": (ids) => ({
    objectId: ids.privateObjectId,
    invitationId: ids.coOwnerInvitationId,
  }),
  "object_invitation.accept": (ids) => ({
    invitationId: ids.coOwnerInvitationId,
  }),
  "object_invitation.decline": (ids) => ({
    invitationId: ids.coOwnerInvitationId,
  }),
  "object.leave": (ids) => ({ objectId: ids.objectId }),
  "object.set_restriction": (ids) => ({
    objectId: ids.objectId,
    period: null,
  }),
  "object.lift_restriction": (ids) => ({
    objectId: ids.objectId,
    restrictionId: ids.restrictionId,
  }),
  "object.consent_to_deletion": (ids) => ({ objectId: ids.objectId }),
  "object.withdraw_deletion_consent": (ids) => ({ objectId: ids.objectId }),
  "account.move_duplicate_object": (ids) => ({
    objectId: ids.objectId,
    basis: text,
  }),

  // Loan requests and loans
  "loan_request.preview": (ids) => ({
    objectId: ids.objectId,
    environmentId: ids.environmentId,
  }),
  "loan_request.create": (ids) => ({
    objectId: ids.objectId,
    origin: environmentOrigin(ids.environmentId),
    start: { kind: "asap" },
    end: { kind: "duration", days: 3 },
    message: text,
    termsVersion: 1,
  }),
  "loan_request.read": (ids) => ({ requestId: ids.requestId }),
  "loan_request.list": (ids) => ({ role: "lender", objectId: ids.objectId }),
  "loan_request.approve": (ids) => ({ requestId: ids.requestId }),
  "loan_request.decline": (ids) => ({ requestId: ids.requestId }),
  "loan_request.withdraw": (ids) => ({ requestId: ids.requestId }),
  "loan_request.confirm_terms": (ids) => ({
    requestId: ids.requestId,
    termsVersion: 1,
  }),
  "loan_request.accept_responsibility": (ids) => ({
    requestId: ids.requestId,
    declarationVersion: 1,
  }),
  "loan.read": (ids) => ({ loanId: ids.loanId }),
  "loan.list": (ids) => ({ state: "current", objectId: ids.objectId }),
  "loan.read_history": (ids) => ({ loanId: ids.loanId }),
  "loan.read_logistics": (ids) => ({ loanId: ids.loanId }),
  "loan.cancel": (ids) => ({ loanId: ids.loanId }),
  "loan.propose_amendment": (ids) => ({
    loanId: ids.loanId,
    agreementVersion: 1,
    period: { start: day(6), end: day(8) },
  }),
  "loan.accept_amendment": (ids) => ({
    loanId: ids.loanId,
    amendmentId: ids.amendmentId,
  }),
  "loan.decline_amendment": (ids) => ({
    loanId: ids.loanId,
    amendmentId: ids.amendmentId,
  }),
  "loan.withdraw_amendment": (ids) => ({
    loanId: ids.loanId,
    amendmentId: ids.amendmentId,
  }),
  "loan.report_handover": (ids) => ({
    loanId: ids.loanId,
    agreementVersion: 1,
    outcome: "handed_over",
  }),
  "loan.report_return": (ids) => ({
    loanId: ids.loanId,
    agreementVersion: 1,
    outcome: "returned",
  }),
  "loan.undo_return": (ids) => ({ loanId: ids.loanId }),
  "loan.confirm_control": (ids) => ({ loanId: ids.loanId }),
  "loan.offer_responsibility": (ids) => ({
    loanId: ids.loanId,
    toUserId: ids.userId,
  }),
  "loan.accept_responsibility_transfer": (ids) => ({
    loanId: ids.loanId,
    transferId: ids.transferId,
  }),
  "loan.decline_responsibility_transfer": (ids) => ({
    loanId: ids.loanId,
    transferId: ids.transferId,
  }),
  "loan.withdraw_responsibility_transfer": (ids) => ({
    loanId: ids.loanId,
    transferId: ids.transferId,
  }),
  "loan.take_over_responsibility": (ids) => ({ loanId: ids.loanId }),
  "loan.request_mediation": (ids) => ({ loanId: ids.loanId, body: text }),
  "loan.read_condition_reports": (ids) => ({ loanId: ids.loanId }),
  "loan.report_condition": (ids) => ({ loanId: ids.loanId, description: text }),
  "loan.answer_condition": (ids) => ({
    loanId: ids.loanId,
    reportId: ids.reportId,
    kind: "explanation",
    description: text,
  }),
  "loan_review.read": (ids) => ({ loanId: ids.loanId }),
  "loan_review.submit": (ids) => ({
    loanId: ids.loanId,
    scores: [{ dimension: "communication", score: 5 }],
  }),
  "loan_review.respond": (ids) => ({ loanId: ids.loanId, text }),

  // Cases and moderation
  "case.read": (ids) => ({ caseId: ids.caseId }),
  "case.write": (ids) => ({ caseId: ids.caseId, body: text }),
  "case.claim": (ids) => ({ caseId: ids.caseId }),
  "case.release": (ids) => ({ caseId: ids.caseId }),
  "case.transfer": (ids) => ({ caseId: ids.caseId, toUserId: ids.userId }),
  "case.open_round": (ids) => ({ caseId: ids.caseId }),
  "case.share_statements": (ids) => ({ caseId: ids.caseId }),
  "case.recuse": (ids) => ({ caseId: ids.caseId }),
  "case.close": (ids) => ({ caseId: ids.caseId }),
  "case.escalate": (ids) => ({ caseId: ids.caseId, body: text }),
  "case.open_environment_contact": (ids) => ({
    environmentId: ids.environmentId,
    body: text,
  }),
  "case.list_environment_queue": (ids) => ({
    environmentId: ids.environmentId,
  }),
  "case.report_in_environment": (ids) => ({
    environmentId: ids.environmentId,
    target: { kind: "object", objectId: ids.objectId },
    body: text,
  }),
  "case.report_to_platform": (ids) => ({
    target: { kind: "object", objectId: ids.objectId },
    body: text,
  }),
  "moderation.take_measure": (ids) => ({
    caseId: ids.caseId,
    measure: "object_blocked",
    reason: text,
  }),
  "moderation.list_measures": (ids) => ({ caseId: ids.caseId }),

  // Chat (ADR-0010)
  "chat.start_conversation": (ids) => ({
    userId: bystander.userId,
    context: { kind: "loan_request", requestId: ids.requestId },
  }),
  "chat.read_conversation": (ids) => ({ conversationId: ids.conversationId }),
  "chat.read_directory": (ids) => ({ conversationId: ids.conversationId }),
  "chat.hide_conversation": (ids) => ({ conversationId: ids.conversationId }),
  "chat.claim_key_packages": (ids) => ({
    conversationId: ids.conversationId,
  }),
  "chat.submit_commit": (ids) => ({
    conversationId: ids.conversationId,
    generation: 1,
    commit: "AAECAw==",
    welcome: null,
    addedDeviceIds: [],
    removedDeviceIds: [],
  }),
  "chat.send_message": (ids) => ({
    conversationId: ids.conversationId,
    generation: 1,
    ciphertext: "AAECAw==",
  }),
  "chat.start_loan_logistics": (ids) => ({ channelId: ids.channelId }),
  "chat.read_link_status": (ids) => ({ linkRequestId: ids.linkRequestId }),
  "chat.finish_link": (ids) => ({ linkRequestId: ids.linkRequestId }),
  "chat.approve_link": (ids) => ({
    linkRequestId: ids.linkRequestId,
    certificate: bystanderDevice.certificate,
    package: "AAECAw==",
  }),

  // Notifications
  "notification.read": (ids) => ({ notificationId: ids.notificationId }),
  "notification.mark_read": (ids) => ({
    notificationIds: [ids.notificationId],
  }),
  "notification.mark_all_read": (ids) => ({ through: ids.notificationId }),
};

/**
 * A private message copied into a case (WP-46) quotes its conversation's id
 * as evidence the party vouches for; it addresses no conversation.
 */
const namesResource = (operation: Operation, key: string) =>
  resourceKeys.has(key) &&
  !(key === "conversationId" && operation.inputKeys.has("privateMessages"));

const probed = allOperations.filter(
  (operation) =>
    reachableByUsers(operation) &&
    [...operation.inputKeys].some((key) => namesResource(operation, key)),
);

/** Reads only: probing as someone with some access must not change the world. */
const reads = probed.filter((operation) => operation.kind === "query");

/** An account no probe names as its target. */
const elsewhere = randomUUID();

/**
 * A valid input for every operation whose only resource is a person, aimed
 * at `userId`. The coverage test below fails when one is missing.
 */
const personProbes: Record<string, (userId: string) => object> = {
  "account.complete_closure": (userId) => ({ userId, basis: text }),
  "account.link_same_person": (userId) => ({
    userId,
    linkedUserId: elsewhere,
    basis: text,
  }),
  "account.read_identity_record": (userId) => ({ userId }),
  "account.record_false_identity": (userId) => ({ userId, basis: text }),
  "account.reinstate": (userId) => ({ userId, basis: text }),
  "account.retire_duplicate": (userId) => ({
    userId,
    continuedUserId: elsewhere,
    basis: text,
  }),
  "account.start_closure": (userId) => ({ userId, basis: text }),
  "account.suspend": (userId) => ({ userId, basis: text }),
  "case.report_unavailability": (userId) => ({ userId, body: text }),
  // A request first, so the ones after it act on something.
  "friendship.request": (userId) => ({ userId }),
  "friendship.accept": (userId) => ({ userId }),
  "friendship.decline": (userId) => ({ userId }),
  "friendship.withdraw": (userId) => ({ userId }),
  "friendship.remove": (userId) => ({ userId }),
  "friend_object.list": (userId) => ({ userId }),
  // After the request is withdrawn, so nothing relates the two any more.
  "person.read": (userId) => ({ userId }),
  "social.relation.read": (userId) => ({ userId }),
  "trust_profile.read": (userId) => ({ userId }),
  "user_block.create": (userId) => ({ userId }),
  "user_block.lift": (userId) => ({ userId }),
};

const personal = allOperations.filter(
  (operation) =>
    reachableByUsers(operation) &&
    operation.inputKeys.has("userId") &&
    !probed.includes(operation),
);

/**
 * What `actor` gets from every operation aimed at the person `userId`, in
 * the order of the probes, as the client gets it. Ids the answers mint (a
 * new case) differ between any two people, so they are set aside too.
 */
async function aimedAt(actor: UserActor, userId: string) {
  const answers: string[] = [];

  for (const [name, probe] of Object.entries(personProbes)) {
    const operation = personal.find((candidate) => candidate.name === name)!;
    const input = probe(userId);
    const outcome = await attempt(kit.tick(), operation, actor, input);
    expect(outcome, `probe for ${name}`).not.toMatchObject({
      refused: "invalid_input",
    });
    answers.push(
      withoutEcho(outcome, input).replace(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g,
        "<minted>",
      ),
    );
  }

  return answers;
}

/**
 * Probes the operations as `actor`, with the world's ids and again with ids
 * that name nothing, and returns the operations whose answers differ: what
 * the actor can reach or tell apart in the world. Each answer is compared
 * as the client gets it, with what was sent in set aside.
 */
async function reachable(
  world: World,
  actor: UserActor,
  operations: readonly Operation[] = probed,
) {
  const random = nowhere(world.ids);
  const differences: string[] = [];

  for (const operation of operations) {
    const probe = probes[operation.name]!;
    const real = await attempt(kit.tick(), operation, actor, probe(world.ids));
    const none = await attempt(kit.tick(), operation, actor, probe(random));

    // An input the operation refuses to parse would prove nothing.
    for (const outcome of [real, none]) {
      expect(outcome, `probe for ${operation.name}`).not.toMatchObject({
        refused: "invalid_input",
      });
    }

    if (
      withoutEcho(real, probe(world.ids)) !== withoutEcho(none, probe(random))
    ) {
      differences.push(operation.name);
    }
  }

  return differences;
}

describe("every operation that names a resource is probed", () => {
  it("has a probe for each one, and none for operations that are gone", () => {
    expect(
      probed.map(({ name }) => name).filter((name) => !(name in probes)),
    ).toEqual([]);
    expect(
      Object.keys(probes).filter(
        (name) => !probed.some((operation) => operation.name === name),
      ),
    ).toEqual([]);
  });

  it("has a probe for each operation aimed at a person", () => {
    expect(personal.map(({ name }) => name).sort()).toEqual(
      Object.keys(personProbes).sort(),
    );
  });
});

describe("hidden environments (PS-NFR-002)", () => {
  // Someone outside the hidden environment probes every operation. Every
  // answer must be the one for ids that name nothing, so nothing tells them
  // the environment, its members, objects, loans or cases exist.
  it("answers a stranger as if nothing in it existed", async () => {
    const world = await hiddenWorld();
    const stranger = await user();
    const eventsByStranger = () =>
      db
        .selectFrom("app.audit_events")
        .select("event_type")
        .where("actor_user_id", "=", stranger.userId)
        .execute();
    const before = await eventsByStranger();

    expect(await reachable(world, stranger)).toEqual([]);
    // Nor does probing leave a trace anyone in it could be told about.
    expect(await eventsByStranger()).toEqual(before);
  });

  it("answers a former member as if nothing in it existed", async () => {
    const world = await hiddenWorld();
    const former = await member(world.ids.environmentId, world.actors.admin);
    await run(leaveEnvironment, former, {
      environmentId: world.ids.environmentId,
    });
    expect(await reachable(world, former)).toEqual([]);
  });

  // Accounts are not hidden, but being in a hidden environment is: aimed at
  // any of its people, every operation answers a stranger the way it does
  // for someone who has only just signed up.
  it("tells a stranger nothing about its people", async () => {
    const world = await hiddenWorld();

    for (const [role, person] of Object.entries(world.actors)) {
      const stranger = await user();
      const newcomer = await user();
      expect(await aimedAt(stranger, person.userId), role).toEqual(
        await aimedAt(stranger, newcomer.userId),
      );
    }
  });
});

/** Lists of the caller's own things that can also be narrowed to one object. */
const ownLists = new Set(["loan_request.list", "loan.list"]);

/** Queries over the caller's own things, which name no resource. */
const ownReads = allOperations.filter(
  (operation) =>
    operation.kind === "query" &&
    reachableByUsers(operation) &&
    (!probed.includes(operation) || ownLists.has(operation.name)),
);

/** The inputs to read the caller's own things with, every way they can. */
function ownInputs(operation: Operation, world: World): object[] {
  const people = Object.values(world.actors);

  switch (operation.name) {
    case "loan_request.list":
      return [{ role: "borrower" }, { role: "lender" }];
    case "loan.list":
      return [{ state: "current" }, { state: "ended" }];
    case "search.environments":
      return [{ q: world.name }];
    default:
      return operation.inputKeys.has("userId")
        ? people.map(({ userId }) => ({ userId }))
        : [{}];
  }
}

/**
 * Everything `actor` can read: every query probed with the world's ids,
 * and every query over their own things (home, lists, notifications,
 * profiles of the world's people, a search for the environment's name),
 * as one text to look for what must not be in it.
 */
async function everythingRead(world: World, actor: UserActor) {
  const answers: string[] = [];
  const read = async (operation: Operation, input: object) => {
    const outcome = await attempt(kit.tick(), operation, actor, input);
    expect(outcome, operation.name).not.toMatchObject({
      refused: "invalid_input",
    });
    answers.push(withoutEcho(outcome, input));
  };

  for (const operation of reads) {
    await read(operation, probes[operation.name]!(world.ids));
  }

  for (const operation of ownReads) {
    for (const input of ownInputs(operation, world)) {
      await read(operation, input);
    }
  }

  return answers.join("\n");
}

/** The lender's chat with the borrower is theirs, wherever either is now. */
const chatReads = ["chat.read_conversation", "chat.read_directory"];

const loanReads = [
  "loan_request.read",
  "loan_review.read",
  "loan.list",
  "loan.read",
  "loan.read_condition_reports",
  "loan.read_history",
  "loan.read_logistics",
];

describe("historical access", () => {
  it("leaves a borrower who left the environment their loan and nothing else", async () => {
    const world = await hiddenWorld();
    await run(leaveEnvironment, world.actors.borrower, {
      environmentId: world.ids.environmentId,
    });

    // The loan goes on (docs/architecture/04, «Eksisterende lån»), without
    // reopening the environment, its objects or its people.
    expect(await reachable(world, world.actors.borrower, reads)).toEqual([
      ...chatReads,
      ...loanReads,
    ]);
    const seen = await everythingRead(world, world.actors.borrower);
    expect(seen).toContain(world.ids.loanId);
    expect(seen).not.toContain(world.ids.environmentId);
    expect(seen).not.toContain(world.name);
  });
});

describe("friends (PS-OBJ-020)", () => {
  it("shows a friend of the owner the object, never the environment, its people or the loan", async () => {
    const world = await hiddenWorld();
    const friend = await user();
    await kit.friends(world.actors.lender, friend);

    expect(await reachable(world, friend, reads)).toEqual([
      "friend_object.read_image",
    ]);
    const seen = await everythingRead(world, friend);
    expect(seen).toContain("Må vaskes etter bruk.");
    expect(seen).not.toContain(world.ids.environmentId);
    expect(seen).not.toContain(world.name);
    expect(seen).not.toContain(world.ids.requestId);
    expect(seen).not.toContain(world.actors.borrower.userId);
  });
});

describe("co-owner boundaries", () => {
  /** A co-owner the lender adds once the loan is approved. */
  async function lateCoOwner(world: World) {
    const late = await user();
    await addCoOwner(world.actors.lender, world.ids.objectId, late);
    return late;
  }

  it("gives a later co-owner the object, never the loan, the borrower or the environment", async () => {
    const world = await hiddenWorld();
    const late = await lateCoOwner(world);

    expect(await reachable(world, late, reads)).toEqual([
      "environment_publication.list_for_object",
      "loan_request.preview",
      "object.read",
      "object.read_history",
      "object.read_image",
    ]);
    const seen = await everythingRead(world, late);
    expect(seen).toContain("Må vaskes etter bruk.");
    expect(seen).not.toContain(world.actors.borrower.userId);
    expect(seen).not.toContain(world.ids.environmentId);
    expect(seen).not.toContain(world.name);
  });

  it("keeps the loan from a later co-owner who is also a member", async () => {
    const world = await hiddenWorld();
    const late = await lateCoOwner(world);
    await kit.join(world.ids.environmentId, world.actors.admin, late);

    const reached = await reachable(world, late, reads);
    expect(reached.filter((name) => loanReads.includes(name))).toEqual([]);
    expect(await everythingRead(world, late)).not.toContain(
      world.ids.requestId,
    );
  });

  it("leaves a co-owner who stepped out nothing", async () => {
    const world = await hiddenWorld();
    const late = await lateCoOwner(world);
    await run(leaveObject, late, { objectId: world.ids.objectId });

    expect(await reachable(world, late)).toEqual([]);
  });
});

/** Every operation on a case, picked up as it is added. */
const caseOperations = probed.filter((operation) =>
  operation.inputKeys.has("caseId"),
);

describe("conflict of interest (PS-USR-009)", () => {
  /**
   * A loan from the hidden environment whose handover the parties dispute,
   * with a mediation case in the environment's queue. The lender and the
   * co-owner are administrators of the environment as well.
   */
  async function mediation() {
    const world = await hiddenWorld();
    const { admin, lender, borrower, coOwner } = world.actors;

    for (const actor of [lender, coOwner]) {
      const { invitationId } = await run(inviteAdministrator, admin, {
        environmentId: world.ids.environmentId,
        userId: actor.userId,
      });
      await run(acceptRoleInvitation, actor, {
        environmentId: world.ids.environmentId,
        invitationId,
      });
    }

    kit.advanceDays(2);
    for (const [actor, outcome] of [
      [lender, "handed_over"],
      [borrower, "not_handed_over"],
    ] as const) {
      await run(reportHandover, actor, {
        loanId: world.ids.loanId,
        agreementVersion: 1,
        outcome,
      });
    }
    const { caseId } = await run(requestLoanMediation, borrower, {
      loanId: world.ids.loanId,
      body: text,
    });

    return { ...world, ids: { ...world.ids, caseId } };
  }

  async function outcomes(world: World, actor: UserActor) {
    const answers: Record<string, string> = {};

    for (const operation of caseOperations) {
      const outcome = await attempt(
        kit.tick(),
        operation,
        actor,
        probes[operation.name]!(world.ids),
      );
      answers[operation.name] = "refused" in outcome ? outcome.refused : "ok";
    }

    return answers;
  }

  const everyCaseOperation = (answer: string) =>
    Object.fromEntries(caseOperations.map(({ name }) => [name, answer]));

  it("refuses an administrator who co-owns the object every case operation", async () => {
    const world = await mediation();

    expect(await outcomes(world, world.actors.coOwner)).toEqual(
      everyCaseOperation("conflict_of_interest"),
    );
  });

  it("lets an administrator who is a party take part only as a party", async () => {
    const world = await mediation();

    expect(await outcomes(world, world.actors.lender)).toEqual({
      ...everyCaseOperation("conflict_of_interest"),
      "case.read": "ok",
      "case.write": "ok",
    });
  });

  it("never lets the case be handed to an involved administrator", async () => {
    const world = await mediation();
    await run(claimCase, world.actors.admin, { caseId: world.ids.caseId });

    await expect(
      run(transferCase, world.actors.admin, {
        caseId: world.ids.caseId,
        toUserId: world.actors.coOwner.userId,
      }),
    ).rejects.toMatchObject({ code: "invalid_input", fields: ["toUserId"] });
  });
});

describe("representatives while OD-0003 is open (PS-ADM-007–008)", () => {
  // The special process is off in the pilot (WP-54): reporting that the
  // lender may have died opens nothing for the reporter or the co-owner.
  it("gives nobody more reach for reporting that a user may have died", async () => {
    const world = await hiddenWorld();
    const { lender, other, coOwner } = world.actors;
    const before = {
      reporter: await reachable(world, other, reads),
      coOwner: await reachable(world, coOwner, reads),
    };

    await run(reportUnavailability, other, {
      userId: lender.userId,
      body: "Jeg har hørt at eieren er død.",
    });
    await run(reportUnavailability, coOwner, {
      userId: lender.userId,
      body: "Medeieren min svarer ikke lenger.",
    });

    expect({
      reporter: await reachable(world, other, reads),
      coOwner: await reachable(world, coOwner, reads),
    }).toEqual(before);
  });
});

describe("privileged platform access stays closed (OD-0010)", () => {
  /**
   * Whatever stronger sign-in the identity provider reports, none is a
   * decided mechanism yet, so the session never counts as stronger
   * authentication (docs/architecture/04, «Sesjonssikkerhet»).
   */
  const reportedMethods = [
    ["totp"],
    ["webauthn"],
    ["phone"],
    ["mfa/totp"],
    ["mfa/webauthn"],
    ["sso/saml"],
    ["oauth"],
    ["password"],
    ["recovery"],
    ["step_up"],
    ["otp", "totp"],
    [],
  ];

  /** A steward signed in with what the provider reports as `aal2`. */
  async function stewardReporting(methods: readonly string[]) {
    const { identity, actor } = await registerTestUser(kit.tick());
    await db
      .insertInto("app.platform_role_grants")
      .values({
        user_id: actor.userId,
        role: "platform_steward",
        granted_at: kit.now(),
        granted_by_process: "ops.platform_roles",
        grant_reason: "Test",
      })
      .execute();

    return (await resolveUserActor(kit.tick(), {
      ...identity,
      authentication: {
        sessionId: randomUUID(),
        assurance: "aal2",
        methods: methods.map((method) => ({ method, at: kit.now() })),
      },
    }))!;
  }

  /** Operations whose actor rules let `actor` through only for their roles. */
  function openedByRole(actor: UserActor) {
    const passes = (who: UserActor, { definition }: Operation) =>
      evaluateActor(definition.policy as Policy<never, never>, {
        actor: who,
        now: kit.now(),
      }).allowed;
    const ordinary: UserActor = { ...actor, platformRoles: [] };

    return allOperations
      .filter(
        (operation) => passes(actor, operation) && !passes(ordinary, operation),
      )
      .map(({ name }) => name);
  }

  it.each(reportedMethods)(
    "opens nothing for a steward whose provider reports %j",
    async (...methods) => {
      const steward = await stewardReporting(methods);
      expect(steward.platformRoles).toEqual(["platform_steward"]);
      expect(steward.authentication.assurance).toBe("aal1");

      // The role lets the steward past no operation's actor rules that an
      // ordinary user does not pass, while the same session with stronger
      // authentication would pass the steward's ones.
      expect(openedByRole(steward)).toEqual([]);
      expect(
        openedByRole({
          ...steward,
          authentication: { ...steward.authentication, assurance: "aal2" },
        }),
      ).toContain("case.list_platform_queue");
    },
  );

  it("refuses a steward every operation on a report to the platform", async () => {
    const world = await hiddenWorld();
    const { caseId } = await run(reportToPlatform, world.actors.other, {
      target: { kind: "object", objectId: world.ids.objectId },
      body: text,
    });
    const steward = await stewardReporting(["totp"]);

    for (const operation of caseOperations) {
      expect(
        await attempt(
          kit.tick(),
          operation,
          steward,
          probes[operation.name]!({ ...world.ids, caseId }),
        ),
        operation.name,
      ).toEqual({ refused: "stronger_authentication_required", fields: [] });
    }

    await expect(
      executeQuery(kit.tick(), listPlatformCaseQueue, {
        actor: steward,
        input: {},
      }),
    ).rejects.toMatchObject({ code: "stronger_authentication_required" });
  });
});
