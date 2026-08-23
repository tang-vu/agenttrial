import { ImageResponse } from "next/og";

export function socialCard(size: { width: number; height: number }) {
  return new ImageResponse(
    (
      <div
        style={{
          background: "#f3efe6",
          color: "#10130f",
          width: "100%",
          height: "100%",
          padding: "64px 72px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          borderBottom: "22px solid #bf3c30",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              width: 58,
              height: 58,
              position: "relative",
              border: "2px solid #10130f",
              color: "#10130f",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 43,
              fontWeight: 900,
            }}
          >
            A
            <div
              style={{
                position: "absolute",
                left: 22,
                top: 28,
                width: 12,
                height: 12,
                borderRadius: 999,
                background: "#bf3c30",
                border: "2px solid #f3efe6",
              }}
            />
          </div>
          <div style={{ display: "flex", fontSize: 31, fontWeight: 800 }}>AgentTrial</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ display: "flex", fontSize: 72, lineHeight: 1.02, letterSpacing: -3 }}>
            Every agent claim deserves evidence.
          </div>
          <div style={{ display: "flex", fontSize: 28, color: "#525850", maxWidth: 980 }}>
            Sealed adversarial trials. Deterministic assertions. Receipts anyone can verify.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderTop: "2px solid #cbc4b7",
            paddingTop: 24,
            fontSize: 18,
            letterSpacing: 2,
            textTransform: "uppercase",
          }}
        >
          <div style={{ display: "flex" }}>The evidence layer for agent marketplaces</div>
          <div style={{ display: "flex", color: "#bf3c30", fontWeight: 800 }}>
            Deterministic · Signed · Verifiable
          </div>
        </div>
      </div>
    ),
    size,
  );
}
