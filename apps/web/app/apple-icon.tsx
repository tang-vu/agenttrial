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
          position: "relative",
          background: "#f3efe6",
          color: "#10130f",
          fontSize: 132,
          fontWeight: 900,
        }}
      >
        A
        <span
          style={{
            position: "absolute",
            left: 73,
            top: 88,
            width: 34,
            height: 34,
            borderRadius: 999,
            background: "#bf3c30",
            border: "5px solid #f3efe6",
          }}
        />
      </div>
    ),
    size,
  );
}
