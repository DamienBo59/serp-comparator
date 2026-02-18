import type { ComparisonData, SimilarityInfo, SerpsMap, TitleComparison, SnippetComparison, CommonWord, PivotPage, Cannibalization } from "./types.js";

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildResultsMarkdown(data: ComparisonData): string {
  const sections: string[] = [];
  sections.push(renderHeader(data.keywords));
  sections.push(renderSimilaritySummary(data.analysis.similarity_matrix, data.analysis.common_urls, data.analysis.common_words));
  sections.push(renderCannibalization(data.analysis.cannibalization));
  sections.push(renderPivotPage(data.analysis.pivot_page, data.keywords));
  sections.push(renderSerpTables(data.keywords, data.serps, data.analysis.url_colors));
  sections.push(renderTitleComparison(data.analysis.title_comparison));
  sections.push(renderSnippetComparison(data.analysis.snippet_comparison));
  sections.push(renderLinks(data.analysis.common_urls, data.analysis.unique_urls, data.keywords));
  sections.push(renderCommonWords(data.analysis.common_words));
  return sections.filter(Boolean).join("\n\n---\n\n");
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderHeader(keywords: string[]): string {
  return `# SERP Comparison\n**Mots-cl\u00e9s :** ${keywords.map((k) => `\`${k}\``).join(", ")}`;
}

function renderSimilaritySummary(
  matrix: Record<string, SimilarityInfo>,
  commonUrls: string[],
  commonWords: CommonWord[],
): string {
  const lines: string[] = ["## Similarit\u00e9"];
  lines.push("");
  lines.push("| Paire | Similarit\u00e9 | URLs communes |");
  lines.push("|-------|-----------|---------------|");

  for (const [pair, info] of Object.entries(matrix)) {
    const emoji = info.percentage >= 40 ? "\ud83d\udfe2" : info.percentage >= 20 ? "\ud83d\udfe1" : "\ud83d\udd34";
    lines.push(`| ${pair} | ${emoji} **${info.percentage}%** | ${info.common_count}/10 |`);
  }

  lines.push("");
  lines.push(`- **URLs communes \u00e0 toutes les SERPs :** ${commonUrls.length}`);
  lines.push(`- **Mots communs trouv\u00e9s :** ${commonWords.length}`);

  return lines.join("\n");
}

function renderCannibalization(cann: Cannibalization): string {
  const emoji = cann.score >= 40 ? "\u26a0\ufe0f" : cann.score >= 20 ? "\ud83d\udfe1" : "\u2705";
  const lines: string[] = ["## Cannibalisation"];
  lines.push("");
  lines.push(`${emoji} **Score : ${cann.score}%**`);
  lines.push("");
  lines.push(`> ${cann.recommendation}`);
  return lines.join("\n");
}

function renderPivotPage(pivot: PivotPage | null, keywords: string[]): string {
  const lines: string[] = ["## Page pivot"];
  lines.push("");

  if (!pivot) {
    lines.push("Aucune page pivot d\u00e9tect\u00e9e \u2014 aucune URL n'appara\u00eet dans plusieurs SERPs.");
    return lines.join("\n");
  }

  const positions = Object.entries(pivot.positions)
    .map(([kw, pos]) => `**${kw}**: #${pos}`)
    .join(" \u00b7 ");

  lines.push(`\u2b50 **[${pivot.domain}](${pivot.url})**`);
  lines.push("");
  lines.push(`- Pr\u00e9sente dans **${pivot.coverage}/${keywords.length}** SERPs`);
  lines.push(`- Position moyenne : **${pivot.avg_position}**`);
  lines.push(`- Positions : ${positions}`);

  return lines.join("\n");
}

function renderSerpTables(keywords: string[], serps: SerpsMap, urlColors: Record<string, string>): string {
  const lines: string[] = ["## R\u00e9sultats SERP"];

  for (const kw of keywords) {
    const results = serps[kw] ?? [];
    lines.push("");
    lines.push(`### \u201c${kw}\u201d (${results.length} r\u00e9sultats)`);
    lines.push("");
    lines.push("| # | Title | Domain | |");
    lines.push("|---|-------|--------|-|");

    for (const r of results) {
      const shared = urlColors[r.link] ? "\u2b24" : "";
      const title = truncate(r.title, 55);
      lines.push(`| ${r.position} | ${escMd(title)} | ${escMd(r.domain)} | ${shared} |`);
    }
  }

  lines.push("");
  lines.push("*\u2b24 = URL pr\u00e9sente dans plusieurs SERPs*");

  return lines.join("\n");
}

function renderTitleComparison(comparisons: TitleComparison[]): string {
  if (!comparisons.length) return "";

  const lines: string[] = ["## Comparaison des Titles"];
  lines.push("");
  lines.push("Un title diff\u00e9rent signifie que Google le r\u00e9\u00e9crit selon l\u2019intention de recherche.");

  for (const c of comparisons) {
    const badge = c.identical ? "\u2705 Identiques" : "\u26a0\ufe0f Diff\u00e9rents";
    lines.push("");
    lines.push(`### ${escMd(c.domain)} \u2014 ${badge}`);
    for (const [kw, title] of Object.entries(c.titles)) {
      lines.push(`- **${escMd(kw)}** : ${escMd(title)}`);
    }
  }

  return lines.join("\n");
}

function renderSnippetComparison(comparisons: SnippetComparison[]): string {
  if (!comparisons.length) return "";

  const lines: string[] = ["## Comparaison des Snippets"];
  lines.push("");
  lines.push("Des snippets diff\u00e9rents r\u00e9v\u00e8lent des nuances d\u2019intention de recherche.");

  for (const c of comparisons) {
    const badge = c.identical ? "\u2705 Identiques" : "\u26a0\ufe0f Diff\u00e9rents";
    lines.push("");
    lines.push(`### ${escMd(c.domain)} \u2014 ${badge}`);
    for (const [kw, snippet] of Object.entries(c.snippets)) {
      lines.push(`- **${escMd(kw)}** : ${escMd(truncate(snippet, 150))}`);
    }
  }

  return lines.join("\n");
}

function renderLinks(
  commonUrls: string[],
  uniqueUrls: Record<string, string[]>,
  keywords: string[],
): string {
  const lines: string[] = ["## Liens"];

  lines.push("");
  lines.push(`### Communs \u00e0 toutes les SERPs (${commonUrls.length})`);
  if (commonUrls.length) {
    for (const url of commonUrls) {
      lines.push(`- [${escMd(extractDomainSimple(url))}](${url})`);
    }
  } else {
    lines.push("Aucun lien commun.");
  }

  for (const kw of keywords) {
    const urls = uniqueUrls[kw] ?? [];
    lines.push("");
    lines.push(`### Uniques \u00e0 \u201c${escMd(kw)}\u201d (${urls.length})`);
    if (urls.length) {
      for (const url of urls) {
        lines.push(`- [${escMd(extractDomainSimple(url))}](${url})`);
      }
    } else {
      lines.push("Aucun lien unique.");
    }
  }

  return lines.join("\n");
}

function renderCommonWords(words: CommonWord[]): string {
  if (!words.length) return "";

  const lines: string[] = ["## Mots communs"];
  lines.push("");
  lines.push("Mots pr\u00e9sents dans les titles et snippets de toutes les SERPs.");
  lines.push("");
  lines.push("| Mot | Fr\u00e9quence |");
  lines.push("|-----|-----------|");

  for (const w of words.slice(0, 20)) {
    lines.push(`| ${escMd(w.word)} | ${w.count} |`);
  }

  if (words.length > 20) {
    lines.push("");
    lines.push(`*... et ${words.length - 20} autres mots*`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + "\u2026";
}

function escMd(str: string): string {
  return str.replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function extractDomainSimple(url: string): string {
  try {
    let d = new URL(url).hostname.toLowerCase();
    if (d.startsWith("www.")) d = d.slice(4);
    return d;
  } catch {
    return url;
  }
}
