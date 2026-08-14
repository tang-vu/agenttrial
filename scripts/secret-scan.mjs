import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const patterns = [
  { name: "OpenAI key", regex: /sk-[A-Za-z0-9_-]{20,}/ },
  { name: "GitHub token", regex: /(?:ghp|github_pat)_[A-Za-z0-9_-]{20,}/ },
  { name: "private key", regex: /-----BEGIN (?:EC |RSA )?PRIVATE KEY-----/ },
];
const findings = [];
for (const file of files) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  for (const pattern of patterns)
    if (pattern.regex.test(content)) findings.push(`${file}: ${pattern.name}`);
}
if (findings.length) {
  console.error(`Potential secrets found:\n${findings.join("\n")}`);
  process.exit(1);
}
console.log(`Secret scan passed (${files.length} tracked files).`);
