import { type HomeSource, homeItem } from "../home/source";
import { getSocialOverview } from "./queries";

/** PS-USR-003: friend requests that wait for the caller's answer. */
export const socialHomeSource: HomeSource = {
  name: "social",
  async items({ query }) {
    const { incomingRequests } = await query(getSocialOverview, {});

    return incomingRequests.map((contact) =>
      homeItem(
        "social.answer_friend_request",
        { type: "user", id: contact.userId },
        { title: contact.realName },
      ),
    );
  },
};
