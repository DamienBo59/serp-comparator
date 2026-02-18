// -- SerpApi raw response (subset we use) --
export interface SerpApiOrganic {
  position?: number;
  title?: string;
  link?: string;
  snippet?: string;
  displayed_link?: string;
}

export interface SerpApiResponse {
  organic_results?: SerpApiOrganic[];
  error?: string;
}

// -- Normalized SERP result --
export interface SerpResult {
  position: number;
  title: string;
  link: string;
  snippet: string;
  domain: string;
  displayed_link: string;
}

// -- Analysis sub-types --
export interface SimilarityInfo {
  common_count: number;
  percentage: number;
  common_urls: string[];
}

export interface TitleComparison {
  url: string;
  domain: string;
  titles: Record<string, string>;
  identical: boolean;
}

export interface SnippetComparison {
  url: string;
  domain: string;
  snippets: Record<string, string>;
  identical: boolean;
}

export interface CommonWord {
  word: string;
  count: number;
}

export interface PivotPage {
  url: string;
  domain: string;
  coverage: number;
  keywords: string[];
  positions: Record<string, number>;
  avg_position: number;
}

export interface Cannibalization {
  score: number;
  recommendation: string;
}

// -- Full analysis result --
export interface Analysis {
  similarity_matrix: Record<string, SimilarityInfo>;
  common_urls: string[];
  unique_urls: Record<string, string[]>;
  url_colors: Record<string, string>;
  title_comparison: TitleComparison[];
  snippet_comparison: SnippetComparison[];
  common_words: CommonWord[];
  pivot_page: PivotPage | null;
  cannibalization: Cannibalization;
}

// -- SERPs keyed by keyword --
export type SerpsMap = Record<string, SerpResult[]>;

// -- Complete result set --
export interface ComparisonData {
  keywords: string[];
  serps: SerpsMap;
  analysis: Analysis;
}

// -- Form input values --
export interface FormValues {
  keyword1: string;
  keyword2: string;
  keyword3: string;
  country: string;
  language: string;
  excludedDomains: string;
}

// -- Raycast preferences --
export interface Preferences {
  apiKey: string;
  defaultCountry: string;
  defaultLanguage: string;
}
