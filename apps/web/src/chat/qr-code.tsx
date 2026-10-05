import { encode } from "uqr";

/**
 * A QR code drawn as one SVG path, so the page needs no script or image
 * from elsewhere. The content is public (a key and its checksum).
 */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: "M", border: 2 });
  const path = data
    .flatMap((row, y) =>
      row.flatMap((dark, x) => (dark ? [`M${x} ${y}h1v1h-1z`] : [])),
    )
    .join("");

  return (
    <svg
      className="qr-code"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
