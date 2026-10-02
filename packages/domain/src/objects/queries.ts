import {
  type ObjectCategoryList,
  objectIdSchema,
  type OwnObjectList,
} from "@lanbort/contracts";
import { z } from "zod";
import { defineQuery } from "../commands/query";
import {
  listObjectCategoriesPolicy,
  listOwnObjectsPolicy,
  readObjectPolicy,
} from "./policies";
import {
  actingUserId,
  loadObjectDetails,
  loadOwnedObjectDetails,
  presentOwnObject,
} from "./state";

/** One object as its owners see it, with actual availability derived now. */
export const getObject = defineQuery({
  name: "object.read",
  input: z.strictObject({ objectId: objectIdSchema }),
  policy: readObjectPolicy,
  load: async ({ db, input }) => {
    const details = await loadObjectDetails(db, input.objectId);

    return details ? { resource: details, context: undefined } : null;
  },
  present: ({ resource, now }) => presentOwnObject(resource, now),
});

/** The user's own objects, active and archived ("Mine ting"). */
export const listOwnObjects = defineQuery({
  name: "object.list_own",
  input: z.strictObject({}),
  policy: listOwnObjectsPolicy,
  load: async ({ db, actor }) => ({
    resource: await loadOwnedObjectDetails(db, actingUserId(actor)),
    context: undefined,
  }),
  present: ({ resource, now }): OwnObjectList => ({
    objects: resource.map((details) => presentOwnObject(details, now)),
  }),
});

/** Categories that can be chosen for objects now. */
export const listObjectCategories = defineQuery({
  name: "object_category.list",
  input: z.strictObject({}),
  policy: listObjectCategoriesPolicy,
  load: async ({ db }) => ({
    resource: await db
      .selectFrom("app.object_categories")
      .select(["id", "parent_id", "label"])
      .where("retired_at", "is", null)
      .orderBy("position")
      .orderBy("label")
      .execute(),
    context: undefined,
  }),
  present: ({ resource }): ObjectCategoryList => ({
    categories: resource.map((category) => ({
      id: category.id,
      parentId: category.parent_id,
      label: category.label,
    })),
  }),
});
