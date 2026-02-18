import { useState } from "react";
import {
  Form,
  ActionPanel,
  Action,
  Detail,
  showToast,
  Toast,
  getPreferenceValues,
  openExtensionPreferences,
} from "@raycast/api";
import { fetchSerp } from "./lib/serpapi.js";
import { runFullAnalysis } from "./lib/analysis.js";
import { buildResultsMarkdown } from "./lib/markdown.js";
import { COUNTRIES, LANGUAGES } from "./lib/constants.js";
import type { FormValues, ComparisonData, SerpsMap, Preferences } from "./lib/types.js";

export default function Command() {
  const preferences = getPreferenceValues<Preferences>();
  const [result, setResult] = useState<ComparisonData | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  async function handleSubmit(values: FormValues) {
    const kw1 = values.keyword1?.trim();
    const kw2 = values.keyword2?.trim();
    const kw3 = values.keyword3?.trim();

    if (!kw1 || !kw2) {
      await showToast({ style: Toast.Style.Failure, title: "Entrez au moins 2 mots-cl\u00e9s" });
      return;
    }

    const keywords = [kw1, kw2];
    if (kw3) keywords.push(kw3);

    const country = values.country || preferences.defaultCountry || "fr";
    const language = values.language || preferences.defaultLanguage || "fr";

    const excludedDomains = values.excludedDomains
      ? values.excludedDomains
          .split(",")
          .map((d) => d.trim().toLowerCase().replace(/^www\./, ""))
          .filter(Boolean)
      : [];

    setIsLoading(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "R\u00e9cup\u00e9ration des SERPs\u2026" });

    try {
      // Fetch all SERPs in parallel
      const resultsList = await Promise.all(
        keywords.map((kw) => fetchSerp(kw, preferences.apiKey, country, language, 10)),
      );

      const serps: SerpsMap = {};
      keywords.forEach((kw, i) => {
        serps[kw] = resultsList[i];
      });

      // Apply domain exclusions
      if (excludedDomains.length) {
        const excluded = new Set(excludedDomains);
        for (const kw of Object.keys(serps)) {
          serps[kw] = serps[kw].filter((r) => !excluded.has(r.domain.replace(/^www\./, "")));
        }
      }

      toast.title = "Analyse en cours\u2026";
      const analysis = runFullAnalysis(serps);

      const data: ComparisonData = { keywords, serps, analysis };
      setResult(data);

      await showToast({ style: Toast.Style.Success, title: "Analyse termin\u00e9e" });
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Erreur",
        message: err instanceof Error ? err.message : "Erreur inconnue",
      });
    } finally {
      setIsLoading(false);
    }
  }

  // -----------------------------------------------------------------------
  // Results view
  // -----------------------------------------------------------------------
  if (result) {
    const markdown = buildResultsMarkdown(result);
    const cann = result.analysis.cannibalization;
    const pivot = result.analysis.pivot_page;

    return (
      <Detail
        isLoading={isLoading}
        markdown={markdown}
        navigationTitle="R\u00e9sultats SERP"
        metadata={
          <Detail.Metadata>
            <Detail.Metadata.Label
              title="Cannibalisation"
              text={`${cann.score}%`}
            />
            {Object.entries(result.analysis.similarity_matrix).map(([pair, info]) => (
              <Detail.Metadata.Label
                key={pair}
                title={pair}
                text={`${info.percentage}% (${info.common_count} URLs)`}
              />
            ))}
            <Detail.Metadata.Separator />
            {pivot ? (
              <Detail.Metadata.Link
                title="Page pivot"
                text={pivot.domain}
                target={pivot.url}
              />
            ) : (
              <Detail.Metadata.Label title="Page pivot" text="Aucune" />
            )}
            <Detail.Metadata.Label
              title="URLs communes"
              text={String(result.analysis.common_urls.length)}
            />
            <Detail.Metadata.Label
              title="Mots communs"
              text={String(result.analysis.common_words.length)}
            />
          </Detail.Metadata>
        }
        actions={
          <ActionPanel>
            <Action title="Nouvelle comparaison" onAction={() => setResult(null)} />
            <Action.CopyToClipboard title="Copier les r\u00e9sultats" content={markdown} />
            <Action title="Pr\u00e9f\u00e9rences" onAction={openExtensionPreferences} />
          </ActionPanel>
        }
      />
    );
  }

  // -----------------------------------------------------------------------
  // Form view
  // -----------------------------------------------------------------------
  return (
    <Form
      isLoading={isLoading}
      navigationTitle="Comparer les SERPs"
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Comparer" onSubmit={handleSubmit} />
          <Action title="Pr\u00e9f\u00e9rences" onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    >
      <Form.TextField id="keyword1" title="Mot-cl\u00e9 1" placeholder="Ex: proteine whey" />
      <Form.TextField id="keyword2" title="Mot-cl\u00e9 2" placeholder="Ex: whey isolate" />
      <Form.TextField id="keyword3" title="Mot-cl\u00e9 3 (optionnel)" placeholder="Ex: meilleure whey" />
      <Form.Separator />
      <Form.Dropdown id="country" title="Pays" defaultValue={preferences.defaultCountry || "fr"}>
        {COUNTRIES.map((c) => (
          <Form.Dropdown.Item key={c.value} value={c.value} title={c.title} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="language" title="Langue" defaultValue={preferences.defaultLanguage || "fr"}>
        {LANGUAGES.map((l) => (
          <Form.Dropdown.Item key={l.value} value={l.value} title={l.title} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="excludedDomains"
        title="Domaines exclus"
        placeholder="amazon.fr, wikipedia.org"
      />
    </Form>
  );
}
