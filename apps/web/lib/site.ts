export const DEFAULT_PUBLIC_ORIGIN = "https://agenttrial.tangvu.dev";

function httpOrigin(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The public AgentTrial origin must use HTTP or HTTPS.");
  }
  if (url.username || url.password) {
    throw new Error("The public AgentTrial origin must not contain credentials.");
  }
  return url.origin;
}

export function canonicalPublicOrigin(configured = process.env.NEXT_PUBLIC_APP_URL) {
  const value = configured?.trim();
  return httpOrigin(value || DEFAULT_PUBLIC_ORIGIN);
}

export function descriptorPublicOrigin(
  requestUrl: string,
  configured = process.env.NEXT_PUBLIC_APP_URL,
) {
  const value = configured?.trim();
  return value ? httpOrigin(value) : httpOrigin(requestUrl);
}
