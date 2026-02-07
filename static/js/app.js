/* =========================================================
   SERP Comparator – Frontend Application
   ========================================================= */

const API_KEY_STORAGE = "serp_comparator_api_key";

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
let currentData = null; // holds last comparison response

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

function show(el) { el.classList.remove("hidden"); }
function hide(el) { el.classList.add("hidden"); }

// ---------------------------------------------------------------------------
// API Key Management
// ---------------------------------------------------------------------------
function getApiKey() {
    return localStorage.getItem(API_KEY_STORAGE) || "";
}

function setApiKey(key) {
    if (key) {
        localStorage.setItem(API_KEY_STORAGE, key);
    } else {
        localStorage.removeItem(API_KEY_STORAGE);
    }
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

    const closeModal = () => {
        modal.classList.add("hidden");
        modal.classList.remove("flex");
    };

    $("#btn-close-modal").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

    $("#btn-save-key").addEventListener("click", () => {
        setApiKey(input.value.trim());
        updateKeyStatus(status);
        setTimeout(closeModal, 600);
    });

    $("#btn-clear-key").addEventListener("click", () => {
        setApiKey("");
        input.value = "";
        updateKeyStatus(status);
    });

    $("#btn-toggle-key-visibility").addEventListener("click", () => {
        const btn = $("#btn-toggle-key-visibility");
        if (input.type === "password") {
            input.type = "text";
            btn.textContent = "Masquer la cl\u00e9";
        } else {
            input.type = "password";
            btn.textContent = "Afficher la cl\u00e9";
        }
    });
}

function updateKeyStatus(el) {
    const key = getApiKey();
    if (key) {
        el.innerHTML = '<span class="text-green-600 font-medium">Cl\u00e9 configur\u00e9e</span> <span class="text-gray-400">(' + key.slice(0, 8) + '...)</span>';
    } else {
        el.innerHTML = '<span class="text-yellow-600 font-medium">Aucune cl\u00e9 — la cl\u00e9 par d\u00e9faut du serveur sera utilis\u00e9e</span>';
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
// Compare action
// ---------------------------------------------------------------------------
async function handleCompare() {
    const kw1 = $("#kw1").value.trim();
    const kw2 = $("#kw2").value.trim();
    const kw3 = $("#kw3").value.trim();

    if (!kw1 || !kw2) {
        showError("Veuillez saisir au moins 2 mots-cl\u00e9s.");
        return;
    }

    const keywords = [kw1, kw2];
    if (kw3) keywords.push(kw3);

    const excludedRaw = $("#excluded-domains").value.trim();
    const excludedDomains = excludedRaw ? excludedRaw.split(",").map((d) => d.trim()).filter(Boolean) : [];

    const apiKey = getApiKey();

    hide($("#results"));
    hide($("#error-box"));
    show($("#loading"));

    try {
        const resp = await fetch("/api/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                keywords,
                country: $("#select-country").value,
                language: $("#select-language").value,
                api_key: apiKey || null,
                excluded_domains: excludedDomains,
            }),
        });

        if (!resp.ok) {
            const err = await resp.json().catch(() => ({ detail: "Erreur inconnue" }));
            throw new Error(err.detail || `Erreur ${resp.status}`);
        }

        currentData = await resp.json();
        renderResults(currentData);
        hide($("#loading"));
        show($("#results"));
    } catch (err) {
        hide($("#loading"));
        showError(err.message);
    }
}

function showError(msg) {
    const box = $("#error-box");
    $("#error-message").textContent = msg;
    show(box);
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderResults(data) {
    renderSummary(data);
    renderCannibalization(data.analysis.cannibalization);
    renderPivot(data.analysis.pivot_page, data.keywords);
    renderSERPs(data);
    renderTitles(data.analysis.title_comparison, data.keywords);
    renderSnippets(data.analysis.snippet_comparison, data.keywords);
    renderLinks(data.analysis.common_urls, data.analysis.unique_urls, data.analysis.url_colors, data.keywords);
    renderWords(data.analysis.common_words);
}

// -- Summary Cards --
function renderSummary(data) {
    const container = $("#summary-cards");
    const matrix = data.analysis.similarity_matrix;
    const pairs = Object.entries(matrix);

    let html = "";

    // Similarity scores for each pair
    pairs.forEach(([pair, info]) => {
        const level = info.percentage >= 40 ? "high" : info.percentage >= 20 ? "medium" : "low";
        const color = level === "high" ? "text-green-600" : level === "medium" ? "text-yellow-600" : "text-red-500";
        html += `
            <div class="summary-card">
                <div class="summary-card-value ${color}">${info.percentage}%</div>
                <div class="summary-card-label">${escapeHtml(pair)}</div>
                <div class="mt-2"><span class="sim-badge ${level}">${info.common_count}/10 URLs communes</span></div>
            </div>
        `;
    });

    // Common URLs count
    html += `
        <div class="summary-card">
            <div class="summary-card-value text-primary-600">${data.analysis.common_urls.length}</div>
            <div class="summary-card-label">URLs communes &agrave; toutes les SERPs</div>
        </div>
    `;

    // Common words count
    html += `
        <div class="summary-card">
            <div class="summary-card-value text-purple-600">${data.analysis.common_words.length}</div>
            <div class="summary-card-label">Mots communs trouv&eacute;s</div>
        </div>
    `;

    container.innerHTML = html;
}

// -- Cannibalization --
function renderCannibalization(cann) {
    const box = $("#cannibalization-box");
    const level = cann.score >= 40 ? "danger" : cann.score >= 20 ? "warning" : "success";
    const icon = level === "danger"
        ? '<svg class="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"/></svg>'
        : level === "warning"
        ? '<svg class="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
        : '<svg class="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';

    box.innerHTML = `
        <div class="alert-box ${level}">
            ${icon}
            <div>
                <p class="font-semibold text-sm">Score de cannibalisation : ${cann.score}%</p>
                <p class="text-sm mt-1">${escapeHtml(cann.recommendation)}</p>
            </div>
        </div>
    `;
}

// -- Pivot Page --
function renderPivot(pivot, keywords) {
    const box = $("#pivot-box");
    if (!pivot) {
        box.innerHTML = `
            <div class="alert-box info">
                <svg class="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                <div>
                    <p class="font-semibold text-sm">Aucune page pivot d&eacute;tect&eacute;e</p>
                    <p class="text-sm mt-1">Aucune URL n'appara&icirc;t dans plusieurs SERPs.</p>
                </div>
            </div>
        `;
        return;
    }

    const positions = Object.entries(pivot.positions)
        .map(([kw, pos]) => `<span class="font-medium">${escapeHtml(kw)}</span>: #${pos}`)
        .join(" &middot; ");

    box.innerHTML = `
        <div class="alert-box info">
            <svg class="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"/></svg>
            <div>
                <p class="font-semibold text-sm">Page pivot : <a href="${escapeHtml(pivot.url)}" target="_blank" class="text-blue-600 underline">${escapeHtml(pivot.domain)}</a></p>
                <p class="text-sm mt-1">Pr&eacute;sente dans ${pivot.coverage}/${keywords.length} SERPs &middot; Position moyenne : ${pivot.avg_position} &middot; ${positions}</p>
            </div>
        </div>
    `;
}

// -- SERPs side by side --
function renderSERPs(data) {
    const grid = $("#serps-grid");
    const kws = data.keywords;
    const colors = data.analysis.url_colors;

    grid.className = `grid gap-6 cols-${kws.length}`;

    let html = "";
    kws.forEach((kw) => {
        const results = data.serps[kw] || [];
        html += `<div class="serp-card">`;
        html += `<div class="serp-card-header">${escapeHtml(kw)} <span class="text-gray-400 font-normal">(${results.length} r&eacute;sultats)</span></div>`;
        results.forEach((r) => {
            const color = colors[r.link];
            const shared = color ? "serp-item-shared" : "";
            html += `
                <div class="serp-item ${shared}">
                    <div class="flex items-start gap-2">
                        <span class="serp-position" ${color ? `style="background:${color}"` : ""}>${r.position}</span>
                        <div class="min-w-0 flex-1">
                            <div class="flex items-center gap-1.5">
                                ${color ? `<span class="color-dot" style="background:${color}"></span>` : ""}
                                <a href="${escapeHtml(r.link)}" target="_blank" class="serp-title hover:text-primary-600" title="${escapeHtml(r.title)}">${escapeHtml(r.title)}</a>
                            </div>
                            <div class="serp-domain">${escapeHtml(r.domain)}</div>
                            <div class="serp-snippet">${escapeHtml(r.snippet)}</div>
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    });
    grid.innerHTML = html;
}

// -- Titles comparison --
function renderTitles(comparisons, keywords) {
    const container = $("#titles-list");
    if (!comparisons.length) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Aucune URL commune trouv\u00e9e pour comparer les titles.</p>';
        return;
    }
    let html = `<p class="text-sm text-gray-500 mb-4">Comparaison des titles pour les URLs pr\u00e9sentes dans plusieurs SERPs. Un title diff\u00e9rent indique que Google r\u00e9\u00e9crit le title selon l'intention de recherche.</p>`;
    comparisons.forEach((c) => {
        const badge = c.identical
            ? '<span class="badge-identical">Identiques</span>'
            : '<span class="badge-different">Diff\u00e9rents</span>';
        html += `<div class="comparison-card">`;
        html += `<div class="comparison-url">${escapeHtml(c.domain)} ${badge}</div>`;
        Object.entries(c.titles).forEach(([kw, title]) => {
            html += `<div class="comparison-kw-label">${escapeHtml(kw)}</div>`;
            html += `<div class="comparison-text">${escapeHtml(title)}</div>`;
        });
        html += `</div>`;
    });
    container.innerHTML = html;
}

// -- Snippets comparison --
function renderSnippets(comparisons, keywords) {
    const container = $("#snippets-list");
    if (!comparisons.length) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Aucune URL commune trouv\u00e9e pour comparer les snippets.</p>';
        return;
    }
    let html = `<p class="text-sm text-gray-500 mb-4">Comparaison des snippets/meta-descriptions. Des snippets diff\u00e9rents r\u00e9v\u00e8lent des nuances d'intention de recherche : Google s\u00e9lectionne des passages diff\u00e9rents pour chaque requ\u00eate.</p>`;
    comparisons.forEach((c) => {
        const badge = c.identical
            ? '<span class="badge-identical">Identiques</span>'
            : '<span class="badge-different">Diff\u00e9rents</span>';
        html += `<div class="comparison-card">`;
        html += `<div class="comparison-url">${escapeHtml(c.domain)} ${badge}</div>`;
        Object.entries(c.snippets).forEach(([kw, snippet]) => {
            html += `<div class="comparison-kw-label">${escapeHtml(kw)}</div>`;
            html += `<div class="comparison-text">${escapeHtml(snippet)}</div>`;
        });
        html += `</div>`;
    });
    container.innerHTML = html;
}

// -- Links --
function renderLinks(commonUrls, uniqueUrls, colors, keywords) {
    const container = $("#links-section");
    let html = "";

    // Common URLs
    html += `<h3 class="font-bold text-gray-900 mb-3">Liens communs \u00e0 toutes les SERPs (${commonUrls.length})</h3>`;
    if (commonUrls.length) {
        html += `<div class="comparison-card mb-6">`;
        commonUrls.forEach((url) => {
            const color = colors[url] || "#3b82f6";
            html += `<div class="link-item"><span class="color-dot" style="background:${color}"></span><a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></div>`;
        });
        html += `</div>`;
    } else {
        html += `<p class="text-gray-400 text-sm mb-6">Aucun lien commun \u00e0 toutes les SERPs.</p>`;
    }

    // Unique URLs per keyword
    html += `<h3 class="font-bold text-gray-900 mb-3">Liens uniques par mot-cl\u00e9</h3>`;
    keywords.forEach((kw) => {
        const urls = uniqueUrls[kw] || [];
        html += `<div class="comparison-card">`;
        html += `<div class="comparison-kw-label">${escapeHtml(kw)} (${urls.length} liens uniques)</div>`;
        if (urls.length) {
            urls.forEach((url) => {
                html += `<div class="link-item"><a href="${escapeHtml(url)}" target="_blank">${escapeHtml(url)}</a></div>`;
            });
        } else {
            html += `<p class="text-gray-400 text-sm py-2">Aucun lien unique.</p>`;
        }
        html += `</div>`;
    });

    container.innerHTML = html;
}

// -- Words --
function renderWords(words) {
    const container = $("#words-section");
    if (!words.length) {
        container.innerHTML = '<p class="text-gray-500 text-sm">Aucun mot commun trouv\u00e9.</p>';
        return;
    }
    let html = `<p class="text-sm text-gray-500 mb-4">Mots pr\u00e9sents dans les titles et snippets de toutes les SERPs, class\u00e9s par fr\u00e9quence.</p>`;
    html += `<div class="flex flex-wrap gap-2">`;
    words.forEach((w) => {
        html += `<span class="word-tag">${escapeHtml(w.word)} <span class="word-tag-count">${w.count}</span></span>`;
    });
    html += `</div>`;
    container.innerHTML = html;
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------
function exportCSV() {
    if (!currentData) return;
    const data = currentData;
    const lines = [];

    // Header
    lines.push("Type,Mot-cl\u00e9,Position,Title,URL,Domain,Snippet");

    // SERP results
    data.keywords.forEach((kw) => {
        (data.serps[kw] || []).forEach((r) => {
            lines.push([
                "SERP",
                csvEscape(kw),
                r.position,
                csvEscape(r.title),
                csvEscape(r.link),
                csvEscape(r.domain),
                csvEscape(r.snippet),
            ].join(","));
        });
    });

    // Blank line
    lines.push("");
    lines.push("Type,Pair,Similarit\u00e9 %,URLs communes");
    Object.entries(data.analysis.similarity_matrix).forEach(([pair, info]) => {
        lines.push([
            "Similarit\u00e9",
            csvEscape(pair),
            info.percentage,
            info.common_count,
        ].join(","));
    });

    lines.push("");
    lines.push("Type,Score,Recommandation");
    lines.push([
        "Cannibalisation",
        data.analysis.cannibalization.score,
        csvEscape(data.analysis.cannibalization.recommendation),
    ].join(","));

    lines.push("");
    lines.push("Mot commun,Fr\u00e9quence");
    data.analysis.common_words.forEach((w) => {
        lines.push(`${csvEscape(w.word)},${w.count}`);
    });

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
function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function csvEscape(str) {
    if (!str) return '""';
    const s = String(str).replace(/"/g, '""');
    return `"${s}"`;
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
    initModal();
    initTabs();

    $("#btn-compare").addEventListener("click", handleCompare);
    $("#btn-export").addEventListener("click", exportCSV);

    // Enter key triggers compare
    ["kw1", "kw2", "kw3"].forEach((id) => {
        $(`#${id}`).addEventListener("keydown", (e) => {
            if (e.key === "Enter") handleCompare();
        });
    });
});
