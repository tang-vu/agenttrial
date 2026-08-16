const body = `Contact: https://github.com/tang-vu/agenttrial/security/advisories/new
Canonical: https://agenttrial.tangvu.dev/.well-known/security.txt
Policy: https://agenttrial.tangvu.dev/security
Preferred-Languages: en, vi
Expires: 2027-08-15T00:00:00Z
`;

export function GET() {
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=3600",
    },
  });
}
