import { describe, expect, it } from "vitest";
import { canonicalPublicOrigin, descriptorPublicOrigin } from "./site";

describe("public site origin", () => {
  it("prefers the configured canonical origin over an internal proxy URL", () => {
    expect(
      descriptorPublicOrigin(
        "https://0.0.0.0:3000/.well-known/agenttrial.json",
        "https://agenttrial.example/subpath",
      ),
    ).toBe("https://agenttrial.example");
  });

  it("uses the request origin for credential-free local development", () => {
    expect(descriptorPublicOrigin("http://127.0.0.1:4178/.well-known/agenttrial.json", "")).toBe(
      "http://127.0.0.1:4178",
    );
  });

  it("rejects non-web schemes and embedded credentials", () => {
    expect(() => canonicalPublicOrigin("file:///tmp/agenttrial")).toThrow(/HTTP or HTTPS/);
    expect(() => canonicalPublicOrigin("https://user:secret@example.com")).toThrow(/credentials/);
  });
});
