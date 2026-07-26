import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path: string[] }> };

const FORWARDED_REQUEST_HEADERS = ["accept", "content-type", "range", "x-music-suite-action"];
const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "cache-control",
  "content-disposition",
  "content-length",
  "content-range",
  "content-type",
  "etag",
  "last-modified"
];

function apiBaseUrl(): URL {
  const raw = process.env.MUSIC_SUITE_API_URL?.trim() || "http://127.0.0.1:8008";
  const parsed = new URL(raw);
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname) ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash
  ) {
    throw new Error("Music Suite API proxy accepts only a plain loopback HTTP URL.");
  }
  return parsed;
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  try {
    const { path } = await context.params;
    const base = apiBaseUrl();
    const safePath = path.map((segment) => encodeURIComponent(segment)).join("/");
    const target = new URL(`/${safePath}${request.nextUrl.search}`, base);
    const headers = new Headers();
    for (const name of FORWARDED_REQUEST_HEADERS) {
      const value = request.headers.get(name);
      if (value) headers.set(name, value);
    }

    const hasBody = !["GET", "HEAD"].includes(request.method);
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      body: hasBody ? request.body : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: request.signal
    };
    if (hasBody && request.body) init.duplex = "half";

    const upstream = await fetch(target, init);
    const responseHeaders = new Headers();
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: responseHeaders
    });
  } catch {
    return Response.json({ detail: "Music Suite API proxy is unavailable." }, { status: 502 });
  }
}

export const GET = proxy;
export const HEAD = proxy;
export const POST = proxy;
export const DELETE = proxy;
export const OPTIONS = proxy;
