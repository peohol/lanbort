"use client";

import { useState } from "react";
import {
  initialsOf,
  pictureFrameStyle,
  pictureSrc,
} from "@/presentation/profile-picture";

export type PictureSize = "small" | "medium" | "large";

/**
 * A person's profile picture in the app's picture shape (PS-USR-002,
 * OD-0027), or their initials in the same shape when the reader sees no
 * picture and `initials` is asked for. It stands next to the name, which
 * says who it is, so it says nothing more to assistive technology.
 */
export function ProfilePicture({
  pictureId,
  name,
  size = "small",
  initials = false,
}: {
  pictureId: string | null;
  name: string | null;
  size?: PictureSize;
  initials?: boolean;
}) {
  const className = `profile-picture profile-picture-${size}`;
  const style = pictureFrameStyle();
  // A picture replaced or hidden since the page was made is not served any
  // more; the person is then shown as if they had none.
  const [failed, setFailed] = useState<string | null>(null);

  if (pictureId && failed !== pictureId) {
    return (
      // A private file behind the API's policy, not a static asset.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className={className}
        style={style}
        src={pictureSrc(pictureId)}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(pictureId)}
        // One that failed before the page came alive has no error to hear.
        ref={(image) => {
          if (image?.complete && image.naturalWidth === 0) {
            setFailed(pictureId);
          }
        }}
      />
    );
  }

  return initials && name ? (
    <span
      className={`${className} profile-initials`}
      style={style}
      aria-hidden="true"
    >
      {initialsOf(name)}
    </span>
  ) : null;
}
