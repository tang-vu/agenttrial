import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#10130f",
          color: "#f3efe6",
          borderBottom: "14px solid #bf3c30",
          fontSize: 64,
          fontWeight: 800,
        }}
      >
        AT
      </div>
    ),
    size,
  );
}
