import { objectChangeFields } from "@lanbort/contracts";
import { z } from "zod";
import { defineEvent } from "../events/catalog";

/**
 * Object events carry ids, versions and field names only: never titles,
 * descriptions, terms or other text the owners wrote.
 */
const objectEvent = <Shape extends z.ZodRawShape>(
  type: string,
  payload: z.ZodObject<Shape>,
) =>
  defineEvent({
    type,
    version: 1,
    kind: "domain",
    resourceType: "object",
    payload,
  });

const version = z.int().min(1);

export const objectCreated = objectEvent(
  "object.created",
  z.strictObject({ version }),
);

/** Which fields an edit changed, never their values. */
export const objectUpdated = objectEvent(
  "object.updated",
  z.strictObject({
    version,
    changedFields: z.array(z.enum(objectChangeFields)).min(1),
  }),
);

export const objectArchived = objectEvent(
  "object.archived",
  z.strictObject({ version }),
);

export const objectRestored = objectEvent(
  "object.restored",
  z.strictObject({ version }),
);

export const objectImageAdded = objectEvent(
  "object.image_added",
  z.strictObject({ version, imageId: z.uuid() }),
);

/** Also triggers deletion of the stored image file (outbox). */
export const objectImageRemoved = objectEvent(
  "object.image_removed",
  z.strictObject({ version, imageId: z.uuid() }),
);
