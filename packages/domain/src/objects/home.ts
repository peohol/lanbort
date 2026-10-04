import { type HomeSource, homeItem } from "../home/source";
import { listCoOwnerInvitations } from "./co-owners";

/** PS-OBJ-007: invitations to co-own an object, until the caller answers. */
export const coOwnerInvitationHomeSource: HomeSource = {
  name: "co_owner_invitations",
  async items({ query }) {
    const { invitations } = await query(listCoOwnerInvitations, {});

    return invitations.map((invitation) =>
      homeItem(
        "object.answer_co_owner_invitation",
        { type: "object_invitation", id: invitation.id },
        { title: invitation.object.title },
      ),
    );
  },
};
