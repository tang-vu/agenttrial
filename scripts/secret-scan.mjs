import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { gunzipSync } from "node:zlib";

const patterns = [
  { name: "OpenAI key", regex: /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/ },
  { name: "GitHub token", regex: /(?:ghp|github_pat)_[A-Za-z0-9_-]{20,}/ },
  { name: "AWS access key", regex: /AKIA[0-9A-Z]{16}/ },
  { name: "private key PEM", regex: /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/ },
  {
    name: "raw signing or wallet key",
    regex: /(?:EAS_PRIVATE_KEY|AGENTTRIAL_SIGNING_SEED)\s*=\s*["']?[0-9a-fA-F]{64}["']?/,
  },
  { name: "Cloudflare tunnel credential", regex: /"TunnelSecret"\s*:\s*"[^"\s]{16,}"/ },
];
// Deliberate redaction-test sentinel; never accepted as a wildcard or prefix.
const reviewedFixtures = ["AKIA1234567890ABCDEF"];
const withoutReviewedFixtures = (content) =>
  reviewedFixtures.reduce((next, fixture) => next.replaceAll(fixture, "[TEST_FIXTURE]"), content);

const listed = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
  encoding: "utf8",
})
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
for (const environmentFile of [".env", ".env.local", ".env.production", ".env.development"])
  if (existsSync(environmentFile)) listed.push(environmentFile);

const findings = [];
for (const file of [...new Set(listed)]) {
  let content;
  try {
    const size = statSync(file).size;
    if (file.endsWith(".json.gz"))
      content = withoutReviewedFixtures(gunzipSync(readFileSync(file)).toString("utf8"));
    else {
      if (size > 2_000_000) continue;
      content = withoutReviewedFixtures(readFileSync(file, "utf8"));
    }
  } catch {
    continue;
  }
  for (const pattern of patterns)
    if (pattern.regex.test(content)) findings.push(`${file}: ${pattern.name}`);
}

const history = withoutReviewedFixtures(
  execFileSync("git", ["log", "--all", "-p", "--no-ext-diff", "--", ".", ":!pnpm-lock.yaml"], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  }),
);
for (const pattern of patterns)
  if (pattern.regex.test(history)) findings.push(`git history: ${pattern.name}`);

if (findings.length) {
  console.error(`Potential secrets found:\n${[...new Set(findings)].join("\n")}`);
  process.exit(1);
}
console.log(
  `Secret scan passed (${new Set(listed).size} working-tree files plus full Git history).`,
);
