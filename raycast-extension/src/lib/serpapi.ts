import fetch from "node-fetch";
import type { SerpApiResponse, SerpResult } from "./types.js";

const SERPAPI_BASE = "https://serpapi.com/search.json";

export function extractDomain(url: string): string {
  try {
    let d = new URL(url).hostname.toLowerCase();
    if (d.startsWith("www.")) d = d.slice(4);
    return d;
  } catch {
    return url;
  }
}

export async function fetchSerp(
  keyword: string,
  apiKey: string,
  country: string = "fr",
  language: string = "fr",
  numResults: number = 10,
): Promise<SerpResult[]> {
  const params = new URLSearchParams({
    q: keyword,
    api_key: apiKey,
    engine: "google",
    gl: country,
    hl: language,
    num: String(numResults),
  });

  const url = `${SERPAPI_BASE}?${params}`;
  const resp = await fetch(url);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`SerpApi error ${resp.status}: ${text.slice(0, 200)}`);
  }

  const data = (await resp.json()) as SerpApiResponse;

  if (data.error) {
    throw new Error(`SerpApi: ${data.error}`);
  }

  const organic = data.organic_results ?? [];
  return organic.slice(0, numResults).map((item) => ({
    position: item.position ?? 0,
    title: item.title ?? "",
    link: item.link ?? "",
    snippet: item.snippet ?? "",
    domain: extractDomain(item.link ?? ""),
    displayed_link: item.displayed_link ?? "",
  }));
}
