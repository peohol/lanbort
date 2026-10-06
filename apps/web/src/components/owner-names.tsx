import type { ShownOwner } from "@lanbort/contracts";
import { Fragment } from "react";
import { PersonName } from "./person-name";

/**
 * A thing's owners as a member sees them (PS-ENV-015), each linked to their
 * page while the reader may open it, said as a list: «Anna, Bo og Cleo».
 */
export function OwnerNames({ owners }: { owners: readonly ShownOwner[] }) {
  return owners.map((owner, index) => (
    <Fragment key={index}>
      {index > 0 && (index === owners.length - 1 ? " og " : ", ")}
      <PersonName person={owner} />
    </Fragment>
  ));
}
