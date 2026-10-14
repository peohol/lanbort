import { ImageResponse } from "next/og";
import { logoSvg } from "@/presentation/logo";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** The icon a phone's home screen shows: the tab's icon, as a picture. */
export default function AppleIcon() {
  const source = `data:image/svg+xml;base64,${Buffer.from(logoSvg({ radius: 0 })).toString("base64")}`;

  return new ImageResponse(
    <img src={source} alt="" width={size.width} height={size.height} />,
    size,
  );
}
