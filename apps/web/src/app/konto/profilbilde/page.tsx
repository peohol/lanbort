import { takesNewActivity } from "@lanbort/domain";
import type { Metadata } from "next";
import { PageHeader } from "@/components/page-header";
import { ProfilePicture } from "@/components/profile-picture";
import { requirePageAccount } from "@/server/session";
import { ProfilePictureSettings } from "../profile-picture-settings";

export const metadata: Metadata = { title: "Profilbilde – Lånbort" };

/** The user's picture, cropped as a circle, and who sees it (PS-USR-002). */
export default async function ProfilePicturePage() {
  const account = await requirePageAccount();

  return (
    <main>
      <PageHeader title="Profilbilde" />
      {takesNewActivity(account.status) ? (
        <ProfilePictureSettings
          realName={account.realName ?? ""}
          picture={account.picture}
        />
      ) : (
        <ProfilePicture
          pictureId={account.picture.pictureId}
          name={account.realName}
          size="large"
        />
      )}
    </main>
  );
}
