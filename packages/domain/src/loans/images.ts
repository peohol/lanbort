import {
  loanImageQuerySchema,
  loanRequestImageQuerySchema,
} from "@lanbort/contracts";
import { defineQuery } from "../commands/query";
import { inSnapshot } from "../objects/state";
import { thingImageFile } from "../objects/thumbnails";
import { readLoanImagePolicy, readLoanRequestImagePolicy } from "./policies";
import { findLoan } from "./reservations";
import { loadRequest } from "./resources";

/**
 * PS-OBJ-021: whoever sees the thing's name sees its pictures. A loan's parties
 * see the thing's pictures as they are now, also after the loan ended, even
 * where they no longer find the thing where the request came from, and its
 * kept thumbnail once it is deleted.
 */
export const loanImageFile = defineQuery({
  name: "loan.read_image",
  input: loanImageQuerySchema,
  policy: readLoanImagePolicy,
  load: ({ db, input }) =>
    inSnapshot(db, async (tx) => {
      const loan = await findLoan(tx, { loanId: input.loanId });
      const file =
        loan &&
        (await thingImageFile(
          tx,
          loan.objectId,
          { loanId: loan.id },
          input.imageId,
        ));

      return loan && file
        ? {
            resource: {
              borrowerUserId: loan.borrowerUserId,
              responsibleLenderId: loan.responsibleLenderId,
              file,
            },
            context: undefined,
          }
        : null;
    }),
  present: ({ resource }) => resource.file,
});

/**
 * PS-OBJ-021: the request's thing's pictures, or its kept thumbnail, for
 * those who see the request.
 */
export const loanRequestImageFile = defineQuery({
  name: "loan_request.read_image",
  input: loanRequestImageQuerySchema,
  policy: readLoanRequestImagePolicy,
  load: ({ db, actor, input, now }) =>
    inSnapshot(db, async (tx) => {
      const loaded = await loadRequest(tx, actor, input.requestId, now);
      const file =
        loaded &&
        (await thingImageFile(
          tx,
          loaded.resource.object?.objectId ?? null,
          { requestId: input.requestId },
          input.imageId,
        ));

      return loaded && file
        ? { resource: { ...loaded.resource, file }, context: undefined }
        : null;
    }),
  present: ({ resource }) => resource.file,
});
