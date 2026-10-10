import type {
  CoOwnerLoan,
  Loan,
  LoanRequest,
  ThingPicture,
} from "@lanbort/contracts";

/**
 * PS-OBJ-021: the first picture of a loan's or request's thing, read the way
 * the reader sees it there: as a party, or as a co-owner who is not one.
 */
export const loanPicture = ({ id, images }: Loan): ThingPicture | null =>
  images[0] ? { through: "loan", loanId: id, imageId: images[0].id } : null;

export const loanRequestPicture = ({
  id,
  images,
}: LoanRequest): ThingPicture | null =>
  images[0]
    ? { through: "loan_request", requestId: id, imageId: images[0].id }
    : null;

export const coOwnerLoanPicture = ({
  objectId,
  images,
}: CoOwnerLoan): ThingPicture | null =>
  images[0] ? { through: "owner", objectId, imageId: images[0].id } : null;

/** The invited user's view of the thing, only while they are asked. */
export const coOwnerInvitationPicture = (
  invitationId: string,
  images: readonly { readonly id: string }[],
): ThingPicture | null =>
  images[0]
    ? { through: "object_invitation", invitationId, imageId: images[0].id }
    : null;
