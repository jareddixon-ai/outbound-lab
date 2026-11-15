// The server route: GET /api/check?domain=example.com
//
// A "route" is a small function that lives on the server. The page in the
// browser calls this address, this code does the DNS lookups, and it answers
// with JSON. Browsers can't do DNS lookups themselves, which is why this
// part has to run on the server (on Vercel once deployed).

import { checkDomain, cleanDomain } from "@/lib/domain-check";

export async function GET(request: Request) {
  const input = new URL(request.url).searchParams.get("domain") ?? "";
  const domain = cleanDomain(input);

  if (!domain) {
    return Response.json(
      { error: "That doesn't look like a domain. Try something like example.com." },
      { status: 400 },
    );
  }

  try {
    return Response.json(await checkDomain(domain));
  } catch (err) {
    console.error("Domain check failed", domain, err);
    return Response.json(
      { error: "The DNS lookup didn't finish. Wait a few seconds and try again." },
      { status: 502 },
    );
  }
}
