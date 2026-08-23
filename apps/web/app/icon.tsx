import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
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
          fontSize: 46,
          fontWeight: 900,
        }}
      >
        A
        <span
          style={{
            position: "absolute",
            left: 26,
            top: 31,
            width: 12,
            height: 12,
            borderRadius: 999,
            background: "#bf3c30",
            border: "2px solid #f3efe6",
          }}
        />
      </div>
    ),
    size,
  );
}
