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
  function inspect(next: EvidenceBundle, isTampered = false) {
    try {
      setBundle(next);
      setResult(verifyBundle(next, { trustedPublicKeys: trustedKeys }));
      setTampered(isTampered);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid bundle");
    }
  }
  useEffect(() => {
    fetch("/api/signing-keys", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setTrustedKeys(data.keys.map((key: { publicKey: string }) => key.publicKey)))
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
        </div>
      )}
      <div className="privacy-note">
        <span>◎</span>
        <p>
          <strong>Private by design</strong>
          <small>
            Parsing, hashing, event-chain checks, and Ed25519 verification happen locally.
          </small>
        </p>
      </div>
    </section>
  );
}
