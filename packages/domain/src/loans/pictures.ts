import type {
  CoOwnerLoan,
  Loan,
  LoanRequest,
  ObjectImage,
  ThingPicture,
} from "@lanbort/contracts";

/** The first picture, as a list shows it (PS-OBJ-002). */
const first = (images: readonly ObjectImage[]) =>
  images[0] ? { imageId: images[0].id, crop: images[0].crop } : null;

/**
 * PS-OBJ-021: the first picture of a loan's or request's thing, read the way
 * the reader sees it there: as a party, or as a co-owner who is not one.
 */
export function loanPicture({ id, images }: Loan): ThingPicture | null {
  const picture = first(images);
  return picture && { through: "loan", loanId: id, ...picture };
}

export function loanRequestPicture({
  id,
  images,
}: LoanRequest): ThingPicture | null {
  const picture = first(images);
  return picture && { through: "loan_request", requestId: id, ...picture };
}

export function coOwnerLoanPicture({
  objectId,
  images,
}: CoOwnerLoan): ThingPicture | null {
  const picture = first(images);
  return picture && { through: "owner", objectId, ...picture };
}

/** The invited user's view of the thing, only while they are asked. */
export function coOwnerInvitationPicture(
  invitationId: string,
  images: readonly ObjectImage[],
): ThingPicture | null {
  const picture = first(images);
  return picture && { through: "object_invitation", invitationId, ...picture };
}
