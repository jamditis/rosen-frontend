import { DataStore } from "./data/dataStore.js";
import { SearchIndex } from "./search/searchIndex.js";
import { influenceOverview } from "./content/influence.js";
import { loadArchiveIndex } from "./data/archiveIndex.js";

const store = new DataStore();
const searchIndex = new SearchIndex(store.getRecords());

const state = {
    searchQuery: "",
    searchResults: searchIndex.search(""),
};

const routes = {
    home: {
        id: "home",
        render: () => `
            <section class="hero">
                <h1>Jay Rosen Internet Archive</h1>
                <p class="hero-tagline">An open research library of journalism, ideas, and teaching.</p>
                <div class="hero-actions">
                    <button class="button button-primary" data-route="search">Search the archive</button>
                    <button class="button button-secondary" data-route="browse">Browse collections</button>
                </div>
            </section>
        `,
    },
    search: {
        id: "search",
        render: () => `
            <section class="hero hero--search">
                <h1>Search</h1>
                <p class="hero-tagline">Unified search will cover quick lookup and advanced filtering.</p>
                <label class="search-label" for="search-input">Search the archive</label>
                <div class="search-input-wrapper">
                    <input id="search-input" class="search-input" type="search" placeholder="Search by title, concept, or topic" value="${state.searchQuery}">
                </div>
                <div class="search-results">
                    <h2>Preview Results</h2>
                    ${renderSearchResults(state.searchResults)}
                </div>
            </section>
        `,
        afterRender: (root) => {
            const input = root.querySelector("#search-input");
            if (input) {
                input.addEventListener("input", (event) => {
                    const target = event.target;
                    if (target instanceof HTMLInputElement) {
                        setSearchQuery(target.value);
                    }
                });
            }
        },
    },
    browse: {
        id: "browse",
        render: () => {
            const facets = store.getFacetValues();
            return `
                <section class="hero">
                    <h1>Browse</h1>
                    <p class="hero-tagline">Dedicated browse views for year, category, format, and key concepts will appear here.</p>
                    <div class="facet-grid">
                        ${renderFacetColumn("Browse by Year", facets.years, "year")}
                        ${renderFacetColumn("Categories", facets.categories, "category")}
                        ${renderFacetColumn("Formats", facets.formats, "format")}
                        ${renderFacetColumn("Key Concepts", facets.keyConcepts, "key-concept")}
                    </div>
                </section>
            `;
        },
    },
    influence: {
        id: "influence",
        render: () => renderInfluencePage(),
        afterRender: (root) => {
            hydrateInfluenceArchiveStatus(root).catch((error) => {
                console.error("Failed to hydrate influence archive status", error);
            });
        },
    },
    about: {
        id: "about",
        render: () => `
            <section class="hero">
                <h1>About the Archive</h1>
                <p class="hero-tagline">Origin story, objectives, and guidance for using the Jay Rosen Internet Archive.</p>
                <div class="info-grid">
                    <article class="info-card">
                        <h2>About Jay Rosen</h2>
                        <p>Biography highlights and key contributions to journalism theory.</p>
                    </article>
                    <article class="info-card">
                        <h2>How the Archive Works</h2>
                        <p>Automated pipeline, AI enrichment, and curation practices drawn from the project narrative.</p>
                    </article>
                    <article class="info-card">
                        <h2>How to Use</h2>
                        <p>Tips for navigating the site, citations, and referencing the archive.</p>
                    </article>
                </div>
            </section>
        `,
    },
    resources: {
        id: "resources",
        render: () => `
            <section class="hero">
                <h1>Resources</h1>
                <p class="hero-tagline">Guides tailored for researchers, journalists, and students.</p>
                <div class="info-grid">
                    <article class="info-card">
                        <h2>For Researchers</h2>
                        <p>Access guidance, citation exports, and influence tracking tools.</p>
                    </article>
                    <article class="info-card">
                        <h2>For Journalists</h2>
                        <p>Quick search patterns, context primers, and quotable excerpts.</p>
                    </article>
                    <article class="info-card">
                        <h2>For Students</h2>
                        <p>Thematic journeys, key concept explainers, and foundational readings.</p>
                    </article>
                </div>
            </section>
        `,
    },
    api: {
        id: "api",
        render: () => `
            <section class="hero">
                <h1>API & Data Access</h1>
                <p class="hero-tagline">Documentation for programmatic access, bulk downloads, and schema references.</p>
                <div class="info-grid">
                    <article class="info-card">
                        <h2>REST & CSV Access</h2>
                        <p>Published Google Sheets endpoints, CSV exports, and rate-limit notes.</p>
                    </article>
                    <article class="info-card">
                        <h2>Data Schemas</h2>
                        <p>Field descriptions covering metadata, AI enrichment, and relationship tracking.</p>
                    </article>
                    <article class="info-card">
                        <h2>Support</h2>
                        <p>Contact paths, usage policies, and attribution requirements.</p>
                    </article>
                </div>
            </section>
        `,
    },
};

const navLinks = [
    { id: "home", label: "Home" },
    { id: "search", label: "Search & Browse" },
    { id: "influence", label: "Influence" },
    { id: "about", label: "About" },
    { id: "resources", label: "Resources" },
    { id: "api", label: "API & Data" },
];

let currentRoute = "home";

function renderNavigation(root) {
    const nav = document.createElement("nav");
    nav.className = "global-nav";
    nav.innerHTML = `
        <div class="nav-brand">
            <span class="brand-title">Jay Rosen Archive</span>
            <span class="brand-subtitle">Researching ideas in journalism</span>
        </div>
        <ul class="nav-links">
            ${navLinks
                .map(
                    (link) => `
                        <li>
                            <button class="nav-link ${currentRoute === link.id ? "is-active" : ""}" data-route="${link.id}">
                                ${link.label}
                            </button>
                        </li>
                    `,
                )
                .join("")}
        </ul>
    `;

    const existingNav = root.querySelector(".global-nav");
    if (existingNav) {
        existingNav.replaceWith(nav);
    } else {
        root.prepend(nav);
    }
}

function renderRoute(routeId) {
    currentRoute = routeId;
    const route = routes[routeId] || routes.home;
    const app = document.getElementById("app");
    const content = document.getElementById("content");

    if (!app || !content) {
        return;
    }

    renderNavigation(app);

    const html = typeof route.render === "function" ? route.render() : route.template ?? "";
    content.innerHTML = html;

    if (typeof route.afterRender === "function") {
        route.afterRender(content);
    }
}

function handleRouteClick(event) {
    const target = event.target;
    if (target instanceof HTMLElement) {
        const routeId = target.dataset.route;
        if (routeId) {
            const facet = target.dataset.facet;
            if (facet) {
                const [, value] = facet.split(":");
                setSearchQuery(value || "");
                return;
            }
            renderRoute(routeId);
        }
    }
}

function renderSearchResults(results) {
    if (!results || results.length === 0) {
        return `<p class="search-empty">No matches yet. Try a different keyword or explore browse modes.</p>`;
    }

    return `
        <ul class="result-list">
            ${results
                .map(
                    (record) => `
                        <li class="result-item">
                            <a href="${record.url}" class="result-link" target="_blank" rel="noopener">
                                <span class="result-title">${record.title}</span>
                                <span class="result-meta">${formatResultMeta(record)}</span>
                            </a>
                            <p class="result-summary">${record.summary}</p>
                        </li>
                    `,
                )
                .join("")}
        </ul>
    `;
}

function renderFacetColumn(title, values, dataRoute) {
    return `
        <article class="facet-card">
            <h2>${title}</h2>
            <ul class="facet-list">
                ${values
                    .map(
                        (entry) => `
                            <li>
                                <button class="facet-pill" data-route="search" data-facet="${dataRoute}:${entry.value}">
                                    <span>${entry.value}</span>
                                    <span class="facet-count">${entry.count}</span>
                                </button>
                            </li>
                        `,
                    )
                    .join("")}
            </ul>
        </article>
    `;
}

function renderInfluencePage() {
    const { hero, sections } = influenceOverview;

    return `
        <section class="hero influence-hero">
            <h1>${hero.title}</h1>
            <p class="hero-tagline">${hero.summary}</p>
            <p class="influence-intro">${hero.intro}</p>
        </section>
        ${sections.map(renderInfluenceSection).join("")}
    `;
}

function renderInfluenceSection(section) {
    return `
        <section class="influence-section" id="${section.slug}">
            <header class="section-header">
                <h2>${section.title}</h2>
                <p>${section.summary}</p>
            </header>
            <div class="concept-grid">
                ${section.concepts.map((concept) => renderConceptCard(section.slug, concept)).join("")}
            </div>
        </section>
    `;
}

function renderConceptCard(sectionSlug, concept) {
    return `
        <article class="concept-card" id="${sectionSlug}-${slugify(concept.title)}">
            <header class="concept-header">
                <h3>${concept.title}</h3>
                <p class="concept-takeaway">${concept.keyTakeaway}</p>
            </header>
            <p class="concept-description">${concept.description}</p>
            ${renderConceptExcerpt(concept.excerpt)}
            ${renderConceptReferences(concept.references)}
        </article>
    `;
}

function renderConceptExcerpt(excerpt) {
    if (!excerpt || !excerpt.text) {
        return "";
    }

    const source = excerpt.sourceLabel ? `<span class="concept-quote-source">— ${excerpt.sourceLabel}</span>` : "";
    return `
        <blockquote class="concept-quote">
            <p>${excerpt.text}</p>
            ${source}
        </blockquote>
    `;
}

function renderConceptReferences(references = []) {
    if (!references.length) {
        return "";
    }

    return `
        <div class="concept-links">
            <h4>Key references</h4>
            <ul>
                ${references
                    .map(
                        (reference) => `
                            <li>
                                <a href="${reference.url}" target="_blank" rel="noopener">
                                    ${reference.label}
                                </a>
                                <span class="archive-status" data-archive-url="${reference.url}">
                                    Checking archive…
                                </span>
                            </li>
                        `,
                    )
                    .join("")}
            </ul>
        </div>
    `;
}

async function hydrateInfluenceArchiveStatus(root) {
    const statusNodes = root.querySelectorAll("[data-archive-url]");
    if (!statusNodes.length) {
        return;
    }

    try {
        const archive = await loadArchiveIndex();
        statusNodes.forEach((node) => {
            const url = node.dataset.archiveUrl;
            const entry = archive.byUrl.get(url);
            node.textContent = entry ? formatArchiveStatus(entry) : "Not yet processed in archive CSV";
        });
    } catch (error) {
        statusNodes.forEach((node) => {
            node.textContent = "Archive index unavailable";
        });
        throw error;
    }
}

function formatResultMeta(record) {
    const date = new Date(record.publication_date);
    const year = Number.isNaN(date.getTime()) ? "Unknown year" : date.getFullYear();
    const format = record.format || "Article";
    return `${year} | ${format}`;
}

function setSearchQuery(query) {
    state.searchQuery = query;
    state.searchResults = searchIndex.search(query);
    renderRoute("search");
}

function formatArchiveStatus(entry) {
    const statusLabel = entry.status === "success" ? "Processed" : entry.status === "failed" ? "Processing failed" : "Status unknown";
    const processed = entry.processed_on ? ` • ${entry.processed_on}` : "";
    const note = entry.Notes ? truncate(entry.Notes, 160) : "";
    return `${statusLabel}${processed}${note ? ` • ${note}` : ""}`;
}

function truncate(value, length) {
    if (value.length <= length) {
        return value;
    }
    return `${value.slice(0, length - 1)}…`;
}

function slugify(value) {
    return value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function init() {
    const app = document.getElementById("app");
    if (!app) {
        return;
    }

    renderNavigation(app);
    renderRoute(currentRoute);

    app.addEventListener("click", handleRouteClick);
}

document.addEventListener("DOMContentLoaded", init);
