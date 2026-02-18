import type {
  Analysis,
  Cannibalization,
  CommonWord,
  PivotPage,
  SerpsMap,
  SimilarityInfo,
  SnippetComparison,
  TitleComparison,
} from "./types.js";
import { COLORS } from "./constants.js";
import { STOPWORDS_EN, STOPWORDS_FR } from "./stopwords.js";
import { extractDomain } from "./serpapi.js";

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

export function computeSimilarity(urlsA: string[], urlsB: string[]): SimilarityInfo {
  const setA = new Set(urlsA);
  const setB = new Set(urlsB);
  const common = [...setA].filter((u) => setB.has(u));
  const total = Math.max(setA.size, setB.size, 1);
  return {
    common_count: common.length,
    percentage: Math.round((common.length / total) * 1000) / 10,
    common_urls: common.sort(),
  };
}

export function buildSimilarityMatrix(serps: SerpsMap): Record<string, SimilarityInfo> {
  const keywords = Object.keys(serps);
  const matrix: Record<string, SimilarityInfo> = {};
  for (let i = 0; i < keywords.length; i++) {
    for (let j = i + 1; j < keywords.length; j++) {
      const kwA = keywords[i];
      const kwB = keywords[j];
      const urlsA = serps[kwA].map((r) => r.link);
      const urlsB = serps[kwB].map((r) => r.link);
      matrix[`${kwA} vs ${kwB}`] = computeSimilarity(urlsA, urlsB);
    }
  }
  return matrix;
}

// ---------------------------------------------------------------------------
// Common / Unique URLs
// ---------------------------------------------------------------------------

export function findCommonUrls(serps: SerpsMap): string[] {
  const sets = Object.values(serps).map((results) => new Set(results.map((r) => r.link)));
  if (!sets.length) return [];
  let common = sets[0];
  for (let i = 1; i < sets.length; i++) {
    common = new Set([...common].filter((u) => sets[i].has(u)));
  }
  return [...common].sort();
}

export function findUniqueUrls(serps: SerpsMap): Record<string, string[]> {
  const allPerKw: Record<string, Set<string>> = {};
  for (const [kw, results] of Object.entries(serps)) {
    allPerKw[kw] = new Set(results.map((r) => r.link));
  }
  const keywords = Object.keys(allPerKw);
  const unique: Record<string, string[]> = {};
  for (const kw of keywords) {
    const others = new Set<string>();
    for (const otherKw of keywords) {
      if (otherKw !== kw) allPerKw[otherKw].forEach((u) => others.add(u));
    }
    unique[kw] = [...allPerKw[kw]].filter((u) => !others.has(u)).sort();
  }
  return unique;
}

// ---------------------------------------------------------------------------
// Color assignment
// ---------------------------------------------------------------------------

export function assignUrlColors(serps: SerpsMap): Record<string, string> {
  const count: Record<string, number> = {};
  for (const results of Object.values(serps)) {
    for (const r of results) count[r.link] = (count[r.link] || 0) + 1;
  }
  const shared = Object.keys(count).filter((u) => count[u] > 1);
  const map: Record<string, string> = {};
  shared.forEach((url, i) => {
    map[url] = COLORS[i % COLORS.length];
  });
  return map;
}

// ---------------------------------------------------------------------------
// Title & Snippet comparison
// ---------------------------------------------------------------------------

export function compareTitles(serps: SerpsMap): TitleComparison[] {
  const urlData: Record<string, Record<string, string>> = {};
  for (const [kw, results] of Object.entries(serps)) {
    for (const r of results) {
      if (!urlData[r.link]) urlData[r.link] = {};
      urlData[r.link][kw] = r.title;
    }
  }
  return Object.entries(urlData)
    .filter(([, titles]) => Object.keys(titles).length >= 2)
    .map(([url, titles]) => {
      const vals = Object.values(titles);
      return {
        url,
        domain: extractDomain(url),
        titles,
        identical: vals.every((t) => t === vals[0]),
      };
    });
}

export function compareSnippets(serps: SerpsMap): SnippetComparison[] {
  const urlData: Record<string, Record<string, string>> = {};
  for (const [kw, results] of Object.entries(serps)) {
    for (const r of results) {
      if (!urlData[r.link]) urlData[r.link] = {};
      urlData[r.link][kw] = r.snippet;
    }
  }
  return Object.entries(urlData)
    .filter(([, snippets]) => Object.keys(snippets).length >= 2)
    .map(([url, snippets]) => {
      const vals = Object.values(snippets);
      return {
        url,
        domain: extractDomain(url),
        snippets,
        identical: vals.every((s) => s === vals[0]),
      };
    });
}

// ---------------------------------------------------------------------------
// Word analysis
// ---------------------------------------------------------------------------

export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z\u00e0\u00e2\u00e4\u00e9\u00e8\u00ea\u00eb\u00ef\u00ee\u00f4\u00f9\u00fb\u00fc\u00ff\u00e7]{3,}/g) || [];
  return words.filter((w) => !STOPWORDS_FR.has(w) && !STOPWORDS_EN.has(w));
}

export function extractCommonWords(serps: SerpsMap, topN: number = 30): CommonWord[] {
  const wordsPerKw: Record<string, Record<string, number>> = {};
  for (const [kw, results] of Object.entries(serps)) {
    const text = results.map((r) => r.title + " " + r.snippet).join(" ");
    const tokens = tokenize(text);
    const counter: Record<string, number> = {};
    tokens.forEach((t) => {
      counter[t] = (counter[t] || 0) + 1;
    });
    wordsPerKw[kw] = counter;
  }
  const kwList = Object.keys(wordsPerKw);
  if (!kwList.length) return [];

  let commonWords = new Set(Object.keys(wordsPerKw[kwList[0]]));
  for (let i = 1; i < kwList.length; i++) {
    const words = new Set(Object.keys(wordsPerKw[kwList[i]]));
    commonWords = new Set([...commonWords].filter((w) => words.has(w)));
  }

  const ranked = [...commonWords].map((word) => {
    const total = kwList.reduce((sum, kw) => sum + (wordsPerKw[kw][word] || 0), 0);
    return { word, count: total };
  });
  ranked.sort((a, b) => b.count - a.count);
  return ranked.slice(0, topN);
}

// ---------------------------------------------------------------------------
// Pivot page detection
// ---------------------------------------------------------------------------

export function detectPivotPage(serps: SerpsMap): PivotPage | null {
  const urlPositions: Record<string, number[]> = {};
  const urlKeywords: Record<string, string[]> = {};
  for (const [kw, results] of Object.entries(serps)) {
    for (const r of results) {
      if (!urlPositions[r.link]) {
        urlPositions[r.link] = [];
        urlKeywords[r.link] = [];
      }
      urlPositions[r.link].push(r.position);
      urlKeywords[r.link].push(kw);
    }
  }
  const candidates = Object.keys(urlKeywords).filter((u) => urlKeywords[u].length >= 2);
  if (!candidates.length) return null;

  let best: PivotPage | null = null;
  for (const url of candidates) {
    const coverage = urlKeywords[url].length;
    const avg = urlPositions[url].reduce((a, b) => a + b, 0) / urlPositions[url].length;
    if (!best || coverage > best.coverage || (coverage === best.coverage && avg < best.avg_position)) {
      const positions: Record<string, number> = {};
      urlKeywords[url].forEach((kw, i) => {
        positions[kw] = urlPositions[url][i];
      });
      best = {
        url,
        domain: extractDomain(url),
        coverage,
        keywords: urlKeywords[url],
        positions,
        avg_position: Math.round(avg * 10) / 10,
      };
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Cannibalization
// ---------------------------------------------------------------------------

export function computeCannibalization(serps: SerpsMap): Cannibalization {
  const keywords = Object.keys(serps);
  if (keywords.length < 2) {
    return { score: 0, recommendation: "Add at least 2 keywords." };
  }

  let totalPct = 0;
  let count = 0;
  for (let i = 0; i < keywords.length; i++) {
    for (let j = i + 1; j < keywords.length; j++) {
      const urlsA = serps[keywords[i]].map((r) => r.link);
      const urlsB = serps[keywords[j]].map((r) => r.link);
      totalPct += computeSimilarity(urlsA, urlsB).percentage;
      count++;
    }
  }
  const avg = Math.round((totalPct / Math.max(count, 1)) * 10) / 10;

  let reco: string;
  if (avg >= 40) {
    reco = "Fusion fortement recommand\u00e9e \u2014 les SERPs sont tr\u00e8s similaires.";
  } else if (avg >= 20) {
    reco = "Fusion recommand\u00e9e \u2014 similarit\u00e9 significative entre les SERPs.";
  } else {
    reco = "Fusion non n\u00e9cessaire sauf si les intentions de recherche sont identiques.";
  }
  return { score: avg, recommendation: reco };
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export function runFullAnalysis(serps: SerpsMap): Analysis {
  return {
    similarity_matrix: buildSimilarityMatrix(serps),
    common_urls: findCommonUrls(serps),
    unique_urls: findUniqueUrls(serps),
    url_colors: assignUrlColors(serps),
    title_comparison: compareTitles(serps),
    snippet_comparison: compareSnippets(serps),
    common_words: extractCommonWords(serps),
    pivot_page: detectPivotPage(serps),
    cannibalization: computeCannibalization(serps),
  };
}
