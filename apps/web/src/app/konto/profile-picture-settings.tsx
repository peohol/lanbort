"use client";

import type {
  OwnProfilePicture,
  ProfilePictureVisibility,
} from "@lanbort/contracts";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { ActionButton } from "@/components/action-button";
import { announce } from "@/components/announcer";
import { postFile, postJson } from "@/components/api-client";
import { announceDataChanged } from "@/components/data-changed";
import { errorMessage } from "@/components/error-messages";
import { ErrorText } from "@/components/error-text";
import { helpId } from "@/components/field";
import { ProfilePicture } from "@/components/profile-picture";
import { PictureCropper } from "./picture-cropper";

/** Who sees the picture, as the people it reaches (UX-PRIV-001). */
const visibilityLabels: Record<ProfilePictureVisibility, string> = {
  general: "Alle som kan se profilen din",
  friends: "Bare vennene dine",
  only_me: "Bare deg",
};

/** The longest side a photo is read at; more is never needed to crop. */
const readMaxSide = 2048;

/** A chosen photo, upright and no larger than needed to crop it. */
async function readPhoto(file: File): Promise<ImageBitmap | null> {
  try {
    const full = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    const scale = readMaxSide / Math.max(full.width, full.height);
    if (scale >= 1) return full;

    const smaller = await createImageBitmap(full, {
      resizeWidth: Math.round(full.width * scale),
      resizeHeight: Math.round(full.height * scale),
      resizeQuality: "high",
    });
    full.close();
    return smaller;
  } catch {
    return null;
  }
}

/**
 * The own profile picture (PS-USR-002): choose a photo, place it in the
 * picture frame, and choose who sees it. The picture is cropped and
 * compressed here and re-encoded by the server, so what is stored is small
 * and carries nothing from the camera.
 */
export function ProfilePictureSettings({
  realName,
  picture,
}: {
  realName: string;
  picture: OwnProfilePicture;
}) {
  const router = useRouter();
  const [photo, setPhoto] = useState<ImageBitmap | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadKey, setUploadKey] = useState(() => crypto.randomUUID());
  const [visibility, setVisibility] = useState(picture.visibility);
  // Choices are saved one after another, so the last one made is the one
  // that stays, however quickly they are made.
  const saved = useRef(picture.visibility);
  const wanted = useRef(picture.visibility);
  const queue = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => () => photo?.close(), [photo]);

  async function choose(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError(null);
    const read = await readPhoto(file);
    if (!read) {
      setError("Bildet kunne ikke leses. Prøv et annet bilde.");
      return;
    }
    // A new photo is a new upload; a retry of the same one keeps its key.
    setUploadKey(crypto.randomUUID());
    setPhoto(read);
  }

  async function save(file: Blob | null) {
    if (!file) {
      setError("Bildet kunne ikke lagres. Prøv et annet bilde.");
      return;
    }
    setSaving(true);
    setError(null);
    const result = await postFile("/api/account/picture", file, {
      idempotencyKey: uploadKey,
    });
    setSaving(false);

    // The lost answer's upload was saved, as it was cropped then: the
    // page shows it, and saving another crop is a new upload.
    if (!result.ok && result.code === "idempotency_key_reused") {
      setUploadKey(crypto.randomUUID());
      setPhoto(null);
      setError(
        "Bildet ble lagret før forbindelsen brøt, slik det var beskåret da. Velg bildet på nytt hvis du vil endre det.",
      );
      router.refresh();
      return;
    }

    if (!result.ok) {
      setError(
        errorMessage(result.code, {
          invalid_input: "Bildet kunne ikke brukes. Prøv et annet bilde.",
        }),
      );
      return;
    }

    setPhoto(null);
    announce("Profilbildet er lagret.");
    announceDataChanged();
    router.refresh();
  }

  function show(next: ProfilePictureVisibility) {
    wanted.current = next;
    setVisibility(next);
    setError(null);
    queue.current = queue.current.then(async () => {
      const result = await postJson("/api/account/picture/visibility", {
        visibility: next,
      });
      const latest = wanted.current === next;

      if (!result.ok) {
        if (latest) {
          wanted.current = saved.current;
          setVisibility(saved.current);
          setError(errorMessage(result.code));
        }
        return;
      }

      saved.current = next;
      if (latest) {
        announce("Valget for hvem som ser bildet er lagret.");
        router.refresh();
      }
    });
  }

  return (
    <div className="profile-picture-settings">
      {photo ? (
        <PictureCropper
          photo={photo}
          saving={saving}
          onSave={(file) => void save(file)}
          onCancel={() => setPhoto(null)}
        />
      ) : (
        <>
          <ProfilePicture
            pictureId={picture.pictureId}
            name={realName}
            size="large"
            initials
          />
          <div className="field">
            <label htmlFor="profilbilde">
              {picture.pictureId ? "Bytt profilbilde" : "Legg til profilbilde"}
            </label>
            <p id={helpId("profilbilde")} className="help">
              Du velger selv utsnittet. Bildet lagres uten posisjon og andre
              opplysninger fra kameraet.
            </p>
            <input
              id="profilbilde"
              type="file"
              accept="image/*"
              aria-describedby={helpId("profilbilde")}
              onChange={(event) => void choose(event)}
            />
          </div>
          {picture.pictureId && (
            <div className="actions">
              <ActionButton
                label="Fjern profilbildet"
                path="/api/account/picture/removal"
                body={{}}
                idempotent={false}
              />
            </div>
          )}
        </>
      )}
      <ErrorText>{error}</ErrorText>
      <fieldset>
        <legend>Hvem ser profilbildet?</legend>
        {(Object.keys(visibilityLabels) as ProfilePictureVisibility[]).map(
          (option) => (
            <div key={option} className="checkbox">
              <input
                id={`profilbilde-${option}`}
                type="radio"
                name="profilbilde-synlighet"
                value={option}
                checked={visibility === option}
                onChange={() => show(option)}
              />
              <label htmlFor={`profilbilde-${option}`}>
                {visibilityLabels[option]}
              </label>
            </div>
          ),
        )}
        <p className="help">
          Andre ser bildet bare der de også kan åpne profilen din.
        </p>
      </fieldset>
    </div>
  );
}
