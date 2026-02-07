import asyncio
import re
from collections import Counter
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

load_dotenv()

app = FastAPI(title="SERP Comparator")

# ---------------------------------------------------------------------------
# Models
# ---------------------------------------------------------------------------

class CompareRequest(BaseModel):
    keywords: list[str]
    country: str = "fr"
    language: str = "fr"
    api_key: str | None = None
    num_results: int = 10
    excluded_domains: list[str] = []


class SingleSearchRequest(BaseModel):
    keyword: str
    country: str = "fr"
    language: str = "fr"
    api_key: str | None = None
    num_results: int = 10


# ---------------------------------------------------------------------------
# Stopwords (FR + EN basics)
# ---------------------------------------------------------------------------

STOPWORDS = {
    "fr": {
        "le", "la", "les", "de", "des", "du", "un", "une", "et", "en", "à",
        "au", "aux", "ce", "ces", "qui", "que", "quel", "quelle", "quels",
        "quelles", "est", "sont", "a", "ont", "pour", "par", "sur", "dans",
        "avec", "plus", "pas", "ne", "se", "son", "sa", "ses", "leur",
        "leurs", "nous", "vous", "ils", "elles", "on", "il", "elle", "je",
        "tu", "me", "te", "lui", "notre", "votre", "mon", "ma", "mes",
        "ton", "ta", "tes", "été", "être", "avoir", "fait", "faire",
        "comme", "tout", "tous", "toute", "toutes", "mais", "ou", "où",
        "donc", "ni", "car", "si", "bien", "très", "aussi", "peut",
        "même", "entre", "après", "avant", "sans", "sous", "chez",
        "cette", "cet", "deux", "trois", "autre", "autres", "y", "d",
        "l", "s", "n", "c", "qu", "j", "m", "t",
    },
    "en": {
        "the", "a", "an", "is", "are", "was", "were", "be", "been",
        "being", "have", "has", "had", "do", "does", "did", "will",
        "would", "could", "should", "may", "might", "can", "shall",
        "to", "of", "in", "for", "on", "with", "at", "by", "from",
        "as", "into", "through", "during", "before", "after", "above",
        "below", "between", "out", "off", "over", "under", "again",
        "further", "then", "once", "here", "there", "when", "where",
        "why", "how", "all", "each", "every", "both", "few", "more",
        "most", "other", "some", "such", "no", "not", "only", "own",
        "same", "so", "than", "too", "very", "and", "but", "or", "nor",
        "if", "it", "its", "this", "that", "these", "those", "i", "me",
        "my", "we", "our", "you", "your", "he", "him", "his", "she",
        "her", "they", "them", "their", "what", "which", "who", "whom",
    },
}

# ---------------------------------------------------------------------------
# Color palette for shared URLs
# ---------------------------------------------------------------------------

COLORS = [
    "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
    "#EC4899", "#06B6D4", "#F97316", "#14B8A6", "#6366F1",
    "#84CC16", "#D946EF", "#0EA5E9", "#E11D48", "#A855F7",
]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_domain(url: str) -> str:
    """Return the domain from a URL (without www.)."""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()
        if domain.startswith("www."):
            domain = domain[4:]
        return domain
    except Exception:
        return url


def tokenize(text: str, language: str = "fr") -> list[str]:
    """Split text into clean lowercase tokens, stripping stopwords."""
    words = re.findall(r"[a-zàâäéèêëïîôùûüÿçœæ]{3,}", text.lower())
    stops = STOPWORDS.get(language, STOPWORDS["fr"]) | STOPWORDS["en"]
    return [w for w in words if w not in stops]


# ---------------------------------------------------------------------------
# SerpApi client
# ---------------------------------------------------------------------------

async def fetch_serp(
    keyword: str,
    api_key: str,
    country: str = "fr",
    language: str = "fr",
    num_results: int = 10,
) -> list[dict]:
    """Fetch organic SERP results from SerpApi."""
    params = {
        "q": keyword,
        "api_key": api_key,
        "engine": "google",
        "gl": country,
        "hl": language,
        "num": num_results,
    }
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get("https://serpapi.com/search.json", params=params)
        if resp.status_code != 200:
            detail = resp.text[:300]
            raise HTTPException(
                status_code=resp.status_code,
                detail=f"SerpApi error: {detail}",
            )
        data = resp.json()

    organic = data.get("organic_results", [])
    results = []
    for item in organic[:num_results]:
        results.append({
            "position": item.get("position", 0),
            "title": item.get("title", ""),
            "link": item.get("link", ""),
            "snippet": item.get("snippet", ""),
            "domain": extract_domain(item.get("link", "")),
            "displayed_link": item.get("displayed_link", ""),
        })
    return results


# ---------------------------------------------------------------------------
# Analysis functions
# ---------------------------------------------------------------------------

def compute_similarity(urls_a: list[str], urls_b: list[str]) -> dict:
    """Compute similarity between two sets of SERP URLs."""
    set_a, set_b = set(urls_a), set(urls_b)
    common = set_a & set_b
    total = max(len(set_a), len(set_b), 1)
    return {
        "common_count": len(common),
        "percentage": round(len(common) / total * 100, 1),
        "common_urls": sorted(common),
    }


def build_similarity_matrix(serps: dict[str, list[dict]]) -> dict:
    """Build pairwise similarity scores for all keyword combinations."""
    keywords = list(serps.keys())
    matrix = {}
    for i in range(len(keywords)):
        for j in range(i + 1, len(keywords)):
            kw_a, kw_b = keywords[i], keywords[j]
            urls_a = [r["link"] for r in serps[kw_a]]
            urls_b = [r["link"] for r in serps[kw_b]]
            key = f"{kw_a} vs {kw_b}"
            matrix[key] = compute_similarity(urls_a, urls_b)
    return matrix


def find_common_urls(serps: dict[str, list[dict]]) -> list[str]:
    """Find URLs present in ALL SERPs."""
    if not serps:
        return []
    url_sets = [set(r["link"] for r in results) for results in serps.values()]
    common = url_sets[0]
    for s in url_sets[1:]:
        common &= s
    return sorted(common)


def find_unique_urls(serps: dict[str, list[dict]]) -> dict[str, list[str]]:
    """Find URLs present in only one SERP."""
    all_urls_per_kw = {
        kw: set(r["link"] for r in results) for kw, results in serps.items()
    }
    other_urls = {}
    keywords = list(all_urls_per_kw.keys())
    for kw in keywords:
        others = set()
        for other_kw in keywords:
            if other_kw != kw:
                others |= all_urls_per_kw[other_kw]
        other_urls[kw] = others

    unique = {}
    for kw in keywords:
        unique[kw] = sorted(all_urls_per_kw[kw] - other_urls[kw])
    return unique


def assign_url_colors(serps: dict[str, list[dict]]) -> dict[str, str]:
    """Assign a color to each URL that appears in more than one SERP."""
    url_count: Counter = Counter()
    for results in serps.values():
        for r in results:
            url_count[r["link"]] += 1

    shared_urls = [url for url, cnt in url_count.items() if cnt > 1]
    color_map = {}
    for idx, url in enumerate(shared_urls):
        color_map[url] = COLORS[idx % len(COLORS)]
    return color_map


def compare_titles(serps: dict[str, list[dict]]) -> list[dict]:
    """Compare titles for URLs appearing in multiple SERPs."""
    url_data: dict[str, dict[str, str]] = {}
    for kw, results in serps.items():
        for r in results:
            url_data.setdefault(r["link"], {})[kw] = r["title"]

    comparisons = []
    for url, titles_by_kw in url_data.items():
        if len(titles_by_kw) < 2:
            continue
        title_values = list(titles_by_kw.values())
        all_same = all(t == title_values[0] for t in title_values)
        comparisons.append({
            "url": url,
            "domain": extract_domain(url),
            "titles": titles_by_kw,
            "identical": all_same,
        })
    return comparisons


def compare_snippets(serps: dict[str, list[dict]]) -> list[dict]:
    """Compare snippets for URLs appearing in multiple SERPs."""
    url_data: dict[str, dict[str, str]] = {}
    for kw, results in serps.items():
        for r in results:
            url_data.setdefault(r["link"], {})[kw] = r["snippet"]

    comparisons = []
    for url, snippets_by_kw in url_data.items():
        if len(snippets_by_kw) < 2:
            continue
        snippet_values = list(snippets_by_kw.values())
        all_same = all(s == snippet_values[0] for s in snippet_values)
        comparisons.append({
            "url": url,
            "domain": extract_domain(url),
            "snippets": snippets_by_kw,
            "identical": all_same,
        })
    return comparisons


def extract_common_words(
    serps: dict[str, list[dict]], language: str = "fr", top_n: int = 30
) -> list[dict]:
    """Extract words common across all SERPs, ranked by frequency."""
    words_per_kw: dict[str, Counter] = {}
    for kw, results in serps.items():
        text = " ".join(r["title"] + " " + r["snippet"] for r in results)
        tokens = tokenize(text, language)
        words_per_kw[kw] = Counter(tokens)

    if not words_per_kw:
        return []

    # Words that appear in ALL SERPs
    common_words = set(list(words_per_kw.values())[0].keys())
    for counter in words_per_kw.values():
        common_words &= set(counter.keys())

    # Rank by total frequency across all SERPs
    ranked = []
    for word in common_words:
        total = sum(c[word] for c in words_per_kw.values())
        ranked.append({"word": word, "count": total})
    ranked.sort(key=lambda x: x["count"], reverse=True)
    return ranked[:top_n]


def detect_pivot_page(serps: dict[str, list[dict]]) -> dict | None:
    """Find the URL that best covers all keywords (best avg position)."""
    url_positions: dict[str, list[int]] = {}
    url_keywords: dict[str, list[str]] = {}
    for kw, results in serps.items():
        for r in results:
            url_positions.setdefault(r["link"], []).append(r["position"])
            url_keywords.setdefault(r["link"], []).append(kw)

    # Only consider URLs present in at least 2 SERPs
    candidates = [
        url for url, kws in url_keywords.items() if len(kws) >= 2
    ]
    if not candidates:
        return None

    best = None
    for url in candidates:
        coverage = len(url_keywords[url])
        avg_pos = sum(url_positions[url]) / len(url_positions[url])
        if best is None or coverage > best["coverage"] or (
            coverage == best["coverage"] and avg_pos < best["avg_position"]
        ):
            best = {
                "url": url,
                "domain": extract_domain(url),
                "coverage": coverage,
                "keywords": url_keywords[url],
                "positions": dict(zip(url_keywords[url], url_positions[url])),
                "avg_position": round(avg_pos, 1),
            }
    return best


def compute_cannibalization(serps: dict[str, list[dict]]) -> dict:
    """Compute cannibalization score and recommendation."""
    keywords = list(serps.keys())
    if len(keywords) < 2:
        return {"score": 0, "recommendation": "Ajoutez au moins 2 mots-clés."}

    # Average pairwise similarity
    total_pct = 0
    count = 0
    for i in range(len(keywords)):
        for j in range(i + 1, len(keywords)):
            urls_a = [r["link"] for r in serps[keywords[i]]]
            urls_b = [r["link"] for r in serps[keywords[j]]]
            sim = compute_similarity(urls_a, urls_b)
            total_pct += sim["percentage"]
            count += 1

    avg_pct = round(total_pct / max(count, 1), 1)

    if avg_pct >= 40:
        reco = "Fusion fortement recommandée — les SERPs sont très similaires."
    elif avg_pct >= 20:
        reco = "Fusion recommandée — similarité significative entre les SERPs."
    else:
        reco = "Fusion non nécessaire sauf si les intentions de recherche sont identiques."

    return {
        "score": avg_pct,
        "recommendation": reco,
    }


# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------

def _resolve_api_key(user_key: str | None) -> str:
    import os
    key = user_key or os.getenv("SERPAPI_KEY", "")
    if not key:
        raise HTTPException(
            status_code=400,
            detail="Aucune clé API fournie. Configurez votre clé dans les paramètres.",
        )
    return key


@app.post("/api/search")
async def search_serp(request: SingleSearchRequest):
    """Search a single keyword and return SERP results."""
    api_key = _resolve_api_key(request.api_key)
    results = await fetch_serp(
        request.keyword, api_key, request.country, request.language, request.num_results
    )
    return {"keyword": request.keyword, "results": results}


@app.post("/api/compare")
async def compare_serps(request: CompareRequest):
    """Compare SERPs for 2-3 keywords and return full analysis."""
    if len(request.keywords) < 2:
        raise HTTPException(status_code=400, detail="Fournissez au moins 2 mots-clés.")
    if len(request.keywords) > 3:
        raise HTTPException(status_code=400, detail="Maximum 3 mots-clés.")

    # Clean keywords
    keywords = [kw.strip() for kw in request.keywords if kw.strip()]
    if len(keywords) < 2:
        raise HTTPException(status_code=400, detail="Fournissez au moins 2 mots-clés valides.")

    api_key = _resolve_api_key(request.api_key)

    # Fetch all SERPs concurrently
    tasks = [
        fetch_serp(kw, api_key, request.country, request.language, request.num_results)
        for kw in keywords
    ]
    results_list = await asyncio.gather(*tasks)
    serps = dict(zip(keywords, results_list))

    # Apply domain exclusions
    if request.excluded_domains:
        excluded = {d.lower().replace("www.", "") for d in request.excluded_domains}
        for kw in serps:
            serps[kw] = [
                r for r in serps[kw]
                if r["domain"].lower().replace("www.", "") not in excluded
            ]

    # Build analysis
    url_colors = assign_url_colors(serps)
    similarity_matrix = build_similarity_matrix(serps)
    common_urls = find_common_urls(serps)
    unique_urls = find_unique_urls(serps)
    title_comp = compare_titles(serps)
    snippet_comp = compare_snippets(serps)
    common_words = extract_common_words(serps, request.language)
    pivot = detect_pivot_page(serps)
    cannibalization = compute_cannibalization(serps)

    return {
        "keywords": keywords,
        "serps": serps,
        "analysis": {
            "similarity_matrix": similarity_matrix,
            "common_urls": common_urls,
            "unique_urls": unique_urls,
            "url_colors": url_colors,
            "title_comparison": title_comp,
            "snippet_comparison": snippet_comp,
            "common_words": common_words,
            "pivot_page": pivot,
            "cannibalization": cannibalization,
        },
    }


# ---------------------------------------------------------------------------
# Static files & SPA
# ---------------------------------------------------------------------------

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")
