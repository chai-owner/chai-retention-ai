// Network boundary mock. Integration tests never reach a real provider: every
// `fetch` is matched against a list of URL patterns and answered with a
// recorded-shape payload. Unmatched URLs fail loudly so a test can't silently
// pass against an endpoint it didn't intend to exercise.
import { vi } from "vitest";

export interface Route {
  match: string | RegExp;
  status?: number;
  json?: unknown;
  body?: string;
  headers?: Record<string, string>;
}

export interface RecordedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
}

export interface FetchMock {
  requests: RecordedRequest[];
  /** All request URLs, for cursor / query-param assertions. */
  urls: () => string[];
  /** The first recorded request whose URL contains `fragment`. */
  find: (fragment: string) => RecordedRequest | undefined;
}

function matches(url: string, m: string | RegExp) {
  return typeof m === "string" ? url.includes(m) : m.test(url);
}

export function mockFetch(routes: Route[]): FetchMock {
  const requests: RecordedRequest[] = [];

  const impl = vi.fn(async (input: unknown, init?: RequestInit) => {
    const url = typeof input === "string" ? input : String((input as { url?: string })?.url ?? input);
    const headers: Record<string, string> = {};
    new Headers((init?.headers as HeadersInit) ?? {}).forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });
    requests.push({
      url,
      method: (init?.method ?? "GET").toUpperCase(),
      headers,
      body: typeof init?.body === "string" ? init.body : undefined,
    });

    const route = routes.find((r) => matches(url, r.match));
    if (!route) {
      throw new Error(`Unmocked request: ${init?.method ?? "GET"} ${url}`);
    }
    const text = route.body ?? (route.json !== undefined ? JSON.stringify(route.json) : "");
    return new Response(text, {
      status: route.status ?? 200,
      headers: { "Content-Type": "application/json", ...(route.headers ?? {}) },
    });
  });

  vi.stubGlobal("fetch", impl);

  return {
    requests,
    urls: () => requests.map((r) => r.url),
    find: (fragment: string) => requests.find((r) => r.url.includes(fragment)),
  };
}
