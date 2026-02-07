/* =========================================================
   SERP Comparator – Full Client-Side Application
   Deployed on GitHub Pages (no backend needed)
   ========================================================= */

const API_KEY_STORAGE = "serp_comparator_api_key";
const SERPAPI_BASE = "https://serpapi.com/search.json";

// CORS proxies (tried in order if one fails)
const CORS_PROXIES = [
    (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
];

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentData = null;

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

// ---------------------------------------------------------------------------
// Stopwords
// ---------------------------------------------------------------------------
const STOPWORDS_FR = new Set([
    "le","la","les","de","des","du","un","une","et","en","a","au","aux","ce",
    "ces","qui","que","quel","quelle","quels","quelles","est","sont","ont",
    "pour","par","sur","dans","avec","plus","pas","ne","se","son","sa","ses",
    "leur","leurs","nous","vous","ils","elles","on","il","elle","je","tu","me",
    "te","lui","notre","votre","mon","ma","mes","ton","ta","tes","ete","etre",
    "avoir","fait","faire","comme","tout","tous","toute","toutes","mais","ou",
    "donc","ni","car","si","bien","tres","aussi","peut","meme","entre",
    "apres","avant","sans","sous","chez","cette","cet","deux","trois",
    "autre","autres","comment","quoi","dont",
]);
const STOPWORDS_EN = new Set([
    "the","a","an","is","are","was","were","be","been","being","have","has",
    "had","do","does","did","will","would","could","should","may","might",
    "can","shall","to","of","in","for","on","with","at","by","from","as",
    "into","through","during","before","after","above","below","between",
    "out","off","over","under","again","further","then","once","here",
    "there","when","where","why","how","all","each","every","both","few",
    "more","most","other","some","such","no","not","only","own","same","so",
    "than","too","very","and","but","or","nor","if","it","its","this","that",
    "these","those","what","which","who","whom","your","you","they","them",
    "their","his","her","she","he","we","our","my",
]);

// ---------------------------------------------------------------------------
// Color palette for shared URLs
// ---------------------------------------------------------------------------
const COLORS = [
    "#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6",
    "#EC4899","#06B6D4","#F97316","#14B8A6","#6366F1",
    "#84CC16","#D946EF","#0EA5E9","#E11D48","#A855F7",
];

// ---------------------------------------------------------------------------
// API Key Management
// ---------------------------------------------------------------------------
function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || "";
}
function setApiKey(key) {
    key ? localStorage.setItem(API_KEY_STORAGE, key) : localStorage.removeItem(API_KEY_STORAGE);
}

function initModal() {
    const modal = $("#modal-api-key");
    const input = $("#input-api-key");
    const status = $("#key-status");

    $("#btn-settings").addEventListener("click", () => {
        input.value = getApiKey();
        updateKeyStatus(status);
        modal.classList.remove("hidden");
        modal.classList.add("flex");
        input.focus();
    });

    const closeModal = () => { modal.classList.add("hidden"); modal.classList.remove("flex"); };
    $("#btn-close-modal").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    $("#btn-save-key").addEventListener("click", () => {
        const val = input.value.trim();
        if (!val) { status.innerHTML = '<span class="text-red-600">Veuillez entrer une cl\u00e9.</span>'; return; }
        setApiKey(val);
        updateKeyStatus(status);
        setTimeout(closeModal, 500);
    });

    $("#btn-clear-key").addEventListener("click", () => {
        setApiKey("");
        input.value = "";
        updateKeyStatus(status);
    });

    $("#btn-toggle-key-visibility").addEventListener("click", () => {
        if (input.type === "password") { input.type = "text"; $("#btn-toggle-key-visibility").textContent = "Masquer"; }
        else { input.type = "password"; $("#btn-toggle-key-visibility").textContent = "Afficher"; }
    });
}

function updateKeyStatus(el) {
    const key = getApiKey();
    if (key) {
        el.innerHTML = `<span class="text-green-600 font-medium">Cl\u00e9 configur\u00e9e</span> <span class="text-gray-400">(${key.slice(0, 8)}\u2026)</span>`;
    } else {
        el.innerHTML = '<span class="text-red-600 font-medium">Aucune cl\u00e9 configur\u00e9e \u2014 cliquez sur "Cl\u00e9 API" pour en ajouter une.</span>';
    }
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function initTabs() {
    $$(".tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            $$(".tab-btn").forEach((b) => b.classList.remove("active"));
            $$(".tab-content").forEach((c) => { c.classList.remove("active"); c.classList.add("hidden"); });
            btn.classList.add("active");
            const tab = $(`#tab-${btn.dataset.tab}`);
            tab.classList.remove("hidden");
            tab.classList.add("active");
        });
    });
}

// ---------------------------------------------------------------------------
// SerpApi Fetch (via CORS proxy)
// ---------------------------------------------------------------------------
async function fetchWithProxy(url) {
    for (let i = 0; i < CORS_PROXIES.length; i++) {
        const proxyUrl = CORS_PROXIES[i](url);
        try {
            const resp = await fetch(proxyUrl);
            if (resp.ok) {
                const data = await resp.json();
                if (data.error) throw new Error(data.error);
                return data;
            }
        } catch (err) {
            if (i === CORS_PROXIES.length - 1) throw err;
        }
    }
    throw new Error("Tous les proxies ont \u00e9chou\u00e9. V\u00e9rifiez votre cl\u00e9 API.");
}

async function fetchSerp(keyword, apiKey, country, language, numResults) {
    const params = new URLSearchParams({
        q: keyword,
        api_key: apiKey,
        engine: "google",
        gl: country,
        hl: language,
        num: String(numResults),
    });
    const url = `${SERPAPI_BASE}?${params}`;
    const data = await fetchWithProxy(url);

    const organic = data.organic_results || [];
    return organic.slice(0, numResults).map((item) => ({
        position: item.position || 0,
        title: item.title || "",
        link: item.link || "",
        snippet: item.snippet || "",
        domain: extractDomain(item.link || ""),
        displayed_link: item.displayed_link || "",
    }));
}

// ---------------------------------------------------------------------------
// Utility: domain extraction
// ---------------------------------------------------------------------------
function extractDomain(url) {
    try {
        let d = new URL(url).hostname.toLowerCase();
        if (d.startsWith("www.")) d = d.slice(4);
        return d;
    } catch { return url; }
}

// ---------------------------------------------------------------------------
// Analysis functions (all client-side)
// ---------------------------------------------------------------------------
function computeSimilarity(urlsA, urlsB) {
    const setA = new Set(urlsA);
    const setB = new Set(urlsB);
    const common = [...setA].filter((u) => setB.has(u));
    const total = Math.max(setA.size, setB.size, 1);
    return { common_count: common.length, percentage: Math.round(common.length / total * 1000) / 10, common_urls: common.sort() };
}

function buildSimilarityMatrix(serps) {
    const keywords = Object.keys(serps);
    const matrix = {};
    for (let i = 0; i < keywords.length; i++) {
        for (let j = i + 1; j < keywords.length; j++) {
            const kwA = keywords[i], kwB = keywords[j];
            const urlsA = serps[kwA].map((r) => r.link);
            const urlsB = serps[kwB].map((r) => r.link);
            matrix[`${kwA} vs ${kwB}`] = computeSimilarity(urlsA, urlsB);
        }
    }
    return matrix;
}

function findCommonUrls(serps) {
    const sets = Object.values(serps).map((results) => new Set(results.map((r) => r.link)));
    if (!sets.length) return [];
    let common = sets[0];
    for (let i = 1; i < sets.length; i++) common = new Set([...common].filter((u) => sets[i].has(u)));
    return [...common].sort();
}

function findUniqueUrls(serps) {
    const allPerKw = {};
    for (const [kw, results] of Object.entries(serps)) allPerKw[kw] = new Set(results.map((r) => r.link));
    const keywords = Object.keys(allPerKw);
    const unique = {};
    for (const kw of keywords) {
        const others = new Set();
        for (const otherKw of keywords) { if (otherKw !== kw) allPerKw[otherKw].forEach((u) => others.add(u)); }
        unique[kw] = [...allPerKw[kw]].filter((u) => !others.has(u)).sort();
    }
    return unique;
}

function assignUrlColors(serps) {
    const count = {};
    for (const results of Object.values(serps)) for (const r of results) count[r.link] = (count[r.link] || 0) + 1;
    const shared = Object.keys(count).filter((u) => count[u] > 1);
    const map = {};
    shared.forEach((url, i) => { map[url] = COLORS[i % COLORS.length]; });
    return map;
}

function compareTitles(serps) {
    const urlData = {};
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
            return { url, domain: extractDomain(url), titles, identical: vals.every((t) => t === vals[0]) };
        });
}

function compareSnippets(serps) {
    const urlData = {};
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
            return { url, domain: extractDomain(url), snippets, identical: vals.every((s) => s === vals[0]) };
        });
}

function tokenize(text) {
    const words = text.toLowerCase().match(/[a-z\u00e0\u00e2\u00e4\u00e9\u00e8\u00ea\u00eb\u00ef\u00ee\u00f4\u00f9\u00fb\u00fc\u00ff\u00e7]{3,}/g) || [];
    return words.filter((w) => !STOPWORDS_FR.has(w) && !STOPWORDS_EN.has(w));
}

function extractCommonWords(serps, topN = 30) {
    const wordsPerKw = {};
    for (const [kw, results] of Object.entries(serps)) {
        const text = results.map((r) => r.title + " " + r.snippet).join(" ");
        const tokens = tokenize(text);
        const counter = {};
        tokens.forEach((t) => { counter[t] = (counter[t] || 0) + 1; });
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

function detectPivotPage(serps) {
    const urlPositions = {};
    const urlKeywords = {};
    for (const [kw, results] of Object.entries(serps)) {
        for (const r of results) {
            if (!urlPositions[r.link]) { urlPositions[r.link] = []; urlKeywords[r.link] = []; }
            urlPositions[r.link].push(r.position);
            urlKeywords[r.link].push(kw);
        }
    }
    const candidates = Object.keys(urlKeywords).filter((u) => urlKeywords[u].length >= 2);
    if (!candidates.length) return null;

    let best = null;
    for (const url of candidates) {
        const coverage = urlKeywords[url].length;
        const avg = urlPositions[url].reduce((a, b) => a + b, 0) / urlPositions[url].length;
        if (!best || coverage > best.coverage || (coverage === best.coverage && avg < best.avg_position)) {
            const positions = {};
            urlKeywords[url].forEach((kw, i) => { positions[kw] = urlPositions[url][i]; });
            best = { url, domain: extractDomain(url), coverage, keywords: urlKeywords[url], positions, avg_position: Math.round(avg * 10) / 10 };
        }
    }
    return best;
}

function computeCannibalization(serps) {
    const keywords = Object.keys(serps);
    if (keywords.length < 2) return { score: 0, recommendation: "Ajoutez au moins 2 mots-cl\u00e9s." };

    let totalPct = 0, count = 0;
    for (let i = 0; i < keywords.length; i++) {
        for (let j = i + 1; j < keywords.length; j++) {
            const urlsA = serps[keywords[i]].map((r) => r.link);
            const urlsB = serps[keywords[j]].map((r) => r.link);
            totalPct += computeSimilarity(urlsA, urlsB).percentage;
            count++;
        }
    }
    const avg = Math.round(totalPct / Math.max(count, 1) * 10) / 10;
    let reco;
    if (avg >= 40) reco = "Fusion fortement recommand\u00e9e \u2014 les SERPs sont tr\u00e8s similaires.";
    else if (avg >= 20) reco = "Fusion recommand\u00e9e \u2014 similarit\u00e9 significative entre les SERPs.";
    else reco = "Fusion non n\u00e9cessaire sauf si les intentions de recherche sont identiques.";
    return { score: avg, recommendation: reco };
}

// ---------------------------------------------------------------------------
// Main Compare Handler
// ---------------------------------------------------------------------------
async function handleCompare() {
    const kw1 = $("#kw1").value.trim();
    const kw2 = $("#kw2").value.trim();
    const kw3 = $("#kw3").value.trim();
    const apiKey = getApiKey();

    if (!apiKey) {
        showError("Aucune cl\u00e9 API configur\u00e9e. Cliquez sur le bouton \"Cl\u00e9 API\" en haut \u00e0 droite pour en ajouter une.");
        return;
    }
    if (!kw1 || !kw2) {
        showError("Veuillez saisir au moins 2 mots-cl\u00e9s.");
        return;
    }

    const keywords = [kw1, kw2];
    if (kw3) keywords.push(kw3);

    const excludedRaw = $("#excluded-domains").value.trim();
    const excludedDomains = excludedRaw ? excludedRaw.split(",").map((d) => d.trim().toLowerCase().replace(/^www\./, "")).filter(Boolean) : [];

    const country = $("#select-country").value;
    const language = $("#select-language").value;

    hide($("#results"));
    hide($("#error-box"));
    show($("#loading"));

    try {
        const promises = keywords.map((kw) => fetchSerp(kw, apiKey, country, language, 10));
        const resultsList = await Promise.all(promises);

        const serps = {};
        keywords.forEach((kw, i) => { serps[kw] = resultsList[i]; });

        if (excludedDomains.length) {
            const excluded = new Set(excludedDomains);
            for (const kw of Object.keys(serps)) {
                serps[kw] = serps[kw].filter((r) => !excluded.has(r.domain.replace(/^www\./, "")));
            }
        }

        const analysis = {
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

        currentData = { keywords, serps, analysis };
        renderResults(currentData);
        hide($("#loading"));
        show($("#results"));
    } catch (err) {
        hide($("#loading"));
        showError(err.message || "Une erreur est survenue.");
    }
}

function showError(msg) {
    $("#error-message").textContent = msg;
    show($("#error-box"));
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderResults(data) {
    renderSummary(data);
    renderCannibalization(data.analysis.cannibalization);
    renderPivot(data.analysis.pivot_page, data.keywords);
    renderSERPs(data);
    renderTitles(data.analysis.title_comparison);
    renderSnippets(data.analysis.snippet_comparison);
    renderLinks(data.analysis.common_urls, data.analysis.unique_urls, data.analysis.url_colors, data.keywords);
    renderWords(data.analysis.common_words);
}

function renderSummary(data) {
    const container = $("#summary-cards");
    const pairs = Object.entries(data.analysis.similarity_matrix);
    let html = "";

    pairs.forEach(([pair, info]) => {
        const level = info.percentage >= 40 ? "high" : info.percentage >= 20 ? "medium" : "low";
        const color = level === "high" ? "text-green-600" : level === "medium" ? "text-yellow-600" : "text-red-500";
        html += `
            <div class="summary-card">
                <div class="summary-card-value ${color}">${info.percentage}%</div>
                <div class="summary-card-label">${esc(pair)}</div>
                <div class="mt-2"><span class="sim-badge ${level}">${info.common_count}/10 URLs communes</span></div>
            </div>`;
    });

    html += `
        <div class="summary-card">
            <div class="summary-card-value text-primary-600">${data.analysis.common_urls.length}</div>
            <div class="summary-card-label">URLs communes \u00e0 toutes les SERPs</div>
        </div>
        <div class="summary-card">
            <div class="summary-card-value text-purple-600">${data.analysis.common_words.length}</div>
            <div class="summary-card-label">Mots communs trouv\u00e9s</div>
        </div>`;

    container.innerHTML = html;
}

function renderCannibalization(cann) {
    const box = $("#cannibalization-box");
    const level = cann.score >= 40 ? "danger" : cann.score >= 20 ? "warning" : "success";
    const icons = {
        danger: '<svg class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>',
        warning: '<svg class="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
        success: '<svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>',
    };
    box.innerHTML = `
        <div class="alert-box ${level}">
            ${icons[level]}
            <div>
                <p class="font-semibold text-sm">Score de cannibalisation : ${cann.score}%</p>
                <p class="text-sm mt-1">${esc(cann.recommendation)}</p>
            </div>
        </div>`;
}

function renderPivot(pivot, keywords) {
    const box = $("#pivot-box");
    if (!pivot) {
        box.innerHTML = `
            <div class="alert-box info">
                <svg class="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <div><p class="font-semibold text-sm">Aucune page pivot d\u00e9tect\u00e9e</p><p class="text-sm mt-1">Aucune URL n'appara\u00eet dans plusieurs SERPs.</p></div>
            </div>`;
        return;
    }
    const positions = Object.entries(pivot.positions).map(([kw, pos]) => `<span class="font-medium">${esc(kw)}</span>: #${pos}`).join(" \u00b7 ");
    box.innerHTML = `
        <div class="alert-box info">
            <svg class="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
            <div>
                <p class="font-semibold text-sm">Page pivot : <a href="${esc(pivot.url)}" target="_blank" class="text-blue-600 underline">${esc(pivot.domain)}</a></p>
                <p class="text-sm mt-1">Pr\u00e9sente dans ${pivot.coverage}/${keywords.length} SERPs \u00b7 Position moyenne : ${pivot.avg_position} \u00b7 ${positions}</p>
            </div>
        </div>`;
}

function renderSERPs(data) {
    const grid = $("#serps-grid");
    const colors = data.analysis.url_colors;
    grid.className = `grid gap-6 cols-${data.keywords.length}`;

    let html = "";
    data.keywords.forEach((kw) => {
        const results = data.serps[kw] || [];
        html += `<div class="serp-card"><div class="serp-card-header">${esc(kw)} <span class="text-gray-400 font-normal">(${results.length})</span></div>`;
        results.forEach((r) => {
            const color = colors[r.link];
            html += `
                <div class="serp-item ${color ? "serp-item-shared" : ""}">
                    <div class="flex items-start gap-2">
                        <span class="serp-position" ${color ? `style="background:${color}"` : ""}>${r.position}</span>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1.5">
                                ${color ? `<span class="color-dot" style="background:${color}"></span>` : ""}
                                <a href="${esc(r.link)}" target="_blank" class="serp-title hover:text-primary-600" title="${esc(r.title)}">${esc(r.title)}</a>
                            </div>
                            <div class="serp-domain">${esc(r.domain)}</div>
                            <div class="serp-snippet">${esc(r.snippet)}</div>
                        </div>
                    </div>
                </div>`;
        });
        html += `</div>`;
    });
    grid.innerHTML = html;
}

function renderTitles(comparisons) {
    const container = $("#titles-list");
    if (!comparisons.length) { container.innerHTML = '<p class="text-gray-500 text-sm">Aucune URL commune pour comparer les titles.</p>'; return; }
    let html = '<p class="text-sm text-gray-500 mb-4">Comparaison des titles pour les URLs pr\u00e9sentes dans plusieurs SERPs. Un title diff\u00e9rent signifie que Google le r\u00e9\u00e9crit selon l\u2019intention.</p>';
    comparisons.forEach((c) => {
        const badge = c.identical ? '<span class="badge-identical">Identiques</span>' : '<span class="badge-different">Diff\u00e9rents</span>';
        html += `<div class="comparison-card"><div class="comparison-url">${esc(c.domain)} ${badge}</div>`;
        Object.entries(c.titles).forEach(([kw, title]) => {
            html += `<div class="comparison-kw-label">${esc(kw)}</div><div class="comparison-text">${esc(title)}</div>`;
        });
        html += `</div>`;
    });
    container.innerHTML = html;
}

function renderSnippets(comparisons) {
    const container = $("#snippets-list");
    if (!comparisons.length) { container.innerHTML = '<p class="text-gray-500 text-sm">Aucune URL commune pour comparer les snippets.</p>'; return; }
    let html = '<p class="text-sm text-gray-500 mb-4">Des snippets diff\u00e9rents r\u00e9v\u00e8lent des nuances d\u2019intention de recherche.</p>';
    comparisons.forEach((c) => {
        const badge = c.identical ? '<span class="badge-identical">Identiques</span>' : '<span class="badge-different">Diff\u00e9rents</span>';
        html += `<div class="comparison-card"><div class="comparison-url">${esc(c.domain)} ${badge}</div>`;
        Object.entries(c.snippets).forEach(([kw, snippet]) => {
            html += `<div class="comparison-kw-label">${esc(kw)}</div><div class="comparison-text">${esc(snippet)}</div>`;
        });
        html += `</div>`;
    });
    container.innerHTML = html;
}

function renderLinks(commonUrls, uniqueUrls, colors, keywords) {
    const container = $("#links-section");
    let html = `<h3 class="font-bold text-gray-900 mb-3">Liens communs \u00e0 toutes les SERPs (${commonUrls.length})</h3>`;
    if (commonUrls.length) {
        html += '<div class="comparison-card mb-6">';
        commonUrls.forEach((url) => {
            const color = colors[url] || "#3b82f6";
            html += `<div class="link-item"><span class="color-dot" style="background:${color}"></span><a href="${esc(url)}" target="_blank">${esc(url)}</a></div>`;
        });
        html += '</div>';
    } else html += '<p class="text-gray-400 text-sm mb-6">Aucun lien commun.</p>';

    html += '<h3 class="font-bold text-gray-900 mb-3">Liens uniques par mot-cl\u00e9</h3>';
    keywords.forEach((kw) => {
        const urls = uniqueUrls[kw] || [];
        html += `<div class="comparison-card"><div class="comparison-kw-label">${esc(kw)} (${urls.length} uniques)</div>`;
        if (urls.length) urls.forEach((url) => { html += `<div class="link-item"><a href="${esc(url)}" target="_blank">${esc(url)}</a></div>`; });
        else html += '<p class="text-gray-400 text-sm py-2">Aucun lien unique.</p>';
        html += '</div>';
    });
    container.innerHTML = html;
}

function renderWords(words) {
    const container = $("#words-section");
    if (!words.length) { container.innerHTML = '<p class="text-gray-500 text-sm">Aucun mot commun trouv\u00e9.</p>'; return; }
    let html = '<p class="text-sm text-gray-500 mb-4">Mots pr\u00e9sents dans les titles et snippets de toutes les SERPs.</p><div class="flex flex-wrap gap-2">';
    words.forEach((w) => { html += `<span class="word-tag">${esc(w.word)} <span class="word-tag-count">${w.count}</span></span>`; });
    html += '</div>';
    container.innerHTML = html;
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------
function exportCSV() {
    if (!currentData) return;
    const d = currentData;
    const lines = [];

    lines.push("Type,Mot-cl\u00e9,Position,Title,URL,Domain,Snippet");
    d.keywords.forEach((kw) => {
        (d.serps[kw] || []).forEach((r) => {
            lines.push(["SERP", csvE(kw), r.position, csvE(r.title), csvE(r.link), csvE(r.domain), csvE(r.snippet)].join(","));
        });
    });

    lines.push("");
    lines.push("Type,Paire,Similarit\u00e9 %,URLs communes");
    Object.entries(d.analysis.similarity_matrix).forEach(([pair, info]) => {
        lines.push(["Similarit\u00e9", csvE(pair), info.percentage, info.common_count].join(","));
    });

    lines.push("");
    lines.push("Type,Score,Recommandation");
    lines.push(["Cannibalisation", d.analysis.cannibalization.score, csvE(d.analysis.cannibalization.recommendation)].join(","));

    lines.push("");
    lines.push("Mot commun,Fr\u00e9quence");
    d.analysis.common_words.forEach((w) => { lines.push(`${csvE(w.word)},${w.count}`); });

    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `serp-comparison-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------
function esc(str) {
    if (!str) return "";
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
}

function csvE(str) {
    if (!str) return '""';
    return `"${String(str).replace(/"/g, '""')}"`;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    initModal();
    initTabs();
    $("#btn-compare").addEventListener("click", handleCompare);
    $("#btn-export").addEventListener("click", exportCSV);
    ["kw1", "kw2", "kw3"].forEach((id) => {
        $(`#${id}`).addEventListener("keydown", (e) => { if (e.key === "Enter") handleCompare(); });
    });
});
