import { listObjectPublications, publishObject } from "@lanbort/domain";
import { userCommandRoute, userQueryRoute } from "@/server/http/command-route";

/** The object's publications, as its owners see them (PS-OBJ-006). */
export const GET = userQueryRoute(listObjectPublications);

/** `{ environmentId }`: publishes the object there, pending or active. */
export const POST = userCommandRoute(publishObject);
