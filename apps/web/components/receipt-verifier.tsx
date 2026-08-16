"use client";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { verifyBundle, type EvidenceBundle, type VerificationResult } from "@agenttrial/evidence";
export function ReceiptVerifier() {
  const params = useSearchParams();
  const [bundle, setBundle] = useState<EvidenceBundle>();
  const [result, setResult] = useState<VerificationResult>();
  const [error, setError] = useState("");
  const [tampered, setTampered] = useState(false);
  const [trustedKeys, setTrustedKeys] = useState<string[]>([]);
  const [pinnedKey, setPinnedKey] = useState("");
  const effectiveTrustedKeys = [
    ...trustedKeys,
    ...(/^[0-9a-fA-F]{64}$/.test(pinnedKey.trim()) ? [pinnedKey.trim().toLowerCase()] : []),
  ];
  function inspect(next: EvidenceBundle, isTampered = false) {
    try {
      if (
        !next ||
        next.schemaVersion !== "1.0.0" ||
        !next.report ||
        !Array.isArray(next.events) ||
        !next.receipt?.payload
      )
        throw new Error("Bundle does not match the supported AgentTrial 1.0 schema.");
      setBundle(next);
      setResult(verifyBundle(next, { trustedPublicKeys: effectiveTrustedKeys }));
      setTampered(isTampered);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid bundle");
    }
  }
  useEffect(() => {
    fetch("/api/signing-keys", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) =>
        setTrustedKeys(
          data.keys
            .filter((key: { status: string }) => key.status !== "revoked")
            .map((key: { publicKey: string }) => key.publicKey),
        ),
      )
      .catch(() => setTrustedKeys([]));
  }, []);
  useEffect(() => {
    const run = params.get("run");
    if (run && trustedKeys.length > 0)
      fetch(`/api/runs/${run}/bundle`)
        .then((r) => {
          if (!r.ok) throw new Error("Bundle unavailable");
          return r.json();
        })
        .then((b) => inspect(b))
        .catch((e) => setError(e.message));
  }, [params, trustedKeys]);
  function upload(file?: File) {
    if (!file) return;
    if (file.size > 2_000_000) {
      setError("Bundle exceeds the 2 MB local verification limit.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        inspect(JSON.parse(String(reader.result)));
      } catch {
        setError("That file is not valid JSON.");
      }
    };
    reader.readAsText(file);
  }
  function tamper() {
    if (!bundle) return;
    const clone = structuredClone(bundle);
    clone.report.evidence[0]!.data = { ...clone.report.evidence[0]!.data, tamperedByte: "1" };
    inspect(clone, true);
  }
  return (
    <section className="verifier-card">
      <label className="drop-zone">
        <input
          type="file"
          accept="application/json,.json"
          onChange={(e) => upload(e.target.files?.[0])}
        />
        <span className="drop-icon">⇧</span>
        <strong>Drop an evidence bundle here</strong>
        <small>or click to choose a canonical JSON file</small>
      </label>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {result && (
        <div className={`verify-result ${result.valid ? "valid" : "invalid"}`}>
          <div className="verify-status">
            <span>{result.valid ? "✓" : "×"}</span>
            <div>
              <strong>
                {result.valid ? "Receipt is cryptographically valid" : "Verification failed"}
              </strong>
              <small>
                {result.valid
                  ? "Hashes, event chain, report claims, and signature match."
                  : `First mismatch: ${result.firstMismatch}`}
              </small>
            </div>
          </div>
          <div className="check-list">
            {result.checks.map((c) => (
              <div key={c.name}>
                <span>{c.valid ? "✓" : "×"}</span>
                <p>
                  <strong>{c.name.replace("-", " ")}</strong>
                  <small>{c.detail}</small>
                </p>
              </div>
            ))}
          </div>
          <button className="button secondary full" onClick={tamper} disabled={tampered}>
            {tampered ? "One byte changed — failure detected" : "Modify one byte and verify again"}
          </button>
          <div className="trust-boundary">
            <strong>Issuer trust boundary</strong>
            <p>
              Integrity is checked locally against the current key registry served by AgentTrial.
              Independent issuer authentication requires pinning that public key from a separately
              trusted release, repository, or onchain attestation.
            </p>
            <label>
              Independently pinned Ed25519 public key (optional)
              <input
                value={pinnedKey}
                onChange={(event) => setPinnedKey(event.target.value)}
                onBlur={() => bundle && inspect(bundle, tampered)}
                placeholder="64 hexadecimal characters"
                inputMode="text"
                spellCheck={false}
                aria-describedby="pinned-key-help"
              />
            </label>
            <small id="pinned-key-help">
              Use a key copied from a trusted repository release or another independently
              authenticated channel. Revoked service keys are never accepted.
            </small>
          </div>
        </div>
      )}
      <div className="privacy-note">
        <span>◎</span>
        <p>
          <strong>Private by design</strong>
          <small>
            The uploaded bundle never leaves this browser. The current signer registry is fetched
            separately from this AgentTrial service.
          </small>
        </p>
      </div>
    </section>
  );
}
