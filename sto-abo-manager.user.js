// ==UserScript==
// @name         sto Abo-Manager Deluxe
// @namespace    http://tampermonkey.net/
// @version      1
// @description  Scannt gezielt nur markierte Updates nach.
// @downloadURL  https://github.com/Skeeve/sto-helpers/raw/refs/heads/main/sto-abo-manager.user.js
// @updateURL    https://github.com/Skeeve/sto-helpers/raw/refs/heads/main/sto-abo-manager.user.js
// @author       https://github.com/Skeeve & Gemini
// @match        https://s.to/account/subscribed*
// @match        https://s.to/account/watchlist*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=s.to
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'sto_abo_cache';
    const DELAY_BETWEEN_REQUESTS = 1; // ms
	// SHOW_LOG Displays a log window that documents the scanning and refreshing process (useful for troubleshooting)
	const SHOW_LOG = false; // true/false
	const LOG_WIDTH = '350px'; // Width of the log window (e.g. '300px' or '20%')
	const LOG_HEIGHT = '450px'; // Max height of the log window (e.g. '400px' or '30vh')

    /// Styles
    GM_addStyle(`
        #tm-logger { pointer-events: none; }
        /* Die neue Highlight-Klasse */
        .tm-highlight .cover-card.is-new {
            border: 2px solid #27ae60 !important;
            box-shadow: 0 0 20px rgba(39, 174, 96, 0.5) !important;
            position: relative !important;
            display: block !important;
        }
        .tm-highlight .cover-card {
            height: 0 !important;
            padding-bottom: 150% !important;
            position: relative !important;
            overflow: hidden !important;
            border-radius: 4px;
            background: #222;
            display: block !important;
        }
        .tm-highlight .cover-card img {
            position: absolute !important;
            top: 0; left: 0;
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important;
        }
        .tm-highlight .show-title-overlay {
            position: absolute;
            bottom: 0; left: 0; right: 0;
            background: rgba(0,0,0,0.8);
            padding: 8px 4px;
            font-size: 11px;
            text-align: center;
            color: #fff;
            z-index: 5;
        }
    `);

    const btnContainer_style = `
        position:fixed;
        bottom:20px;
        right:20px;
        z-index:9999;
        display:flex;
        gap:10px;
    `.replace(/\s+/g, ' ').trim();

    const btn_style = `
        padding:10px;
        background:#27ae60;
        color:white;
        border:none;
        border-radius:5px;
        cursor:pointer;
        font-weight:bold;
    `.replace(/\s+/g, ' ').trim();

    const btnRefresh_style = `
        padding:10px;
        background:#2980b9;
        color:white;
        border:none;
        border-radius:5px;
        cursor:pointer;
        font-weight:bold;
    `.replace(/\s+/g, ' ').trim();

    const btnClear_style = `
        padding:10px;
        background:#c0392b;
        color:white;
        border:none;
        border-radius:5px;
        cursor:pointer;
        font-weight:bold;
    `.replace(/\s+/g, ' ').trim();

    const badge_style = `
        position:absolute;
        top:5px;
        left:5px;
        background:#27ae60;
        color:white;
        padding:2px 6px;
        border-radius:3px;
        font-weight:bold;
        font-size:10px;
        z-index:10;
    `.replace(/\s+/g, ' ').trim();

    const loggerUI = GM_addElement(document.documentElement, 'div', {
        id: 'tm-logger',
        style:`
            display: ${SHOW_LOG?'block':'none'};
            width: ${LOG_WIDTH};
            max-height: ${LOG_HEIGHT};
            position: fixed;
            top: 0;
            right: 0;
            background: rgba(0, 0, 0, 0.85);
            color: cyan;
            z-index: 999999;
            overflow: auto;
            padding: 8px;
            border-left: 2px solid cyan;
            font-family: monospace;
            font-size: 11px;
            overflow-wrap: break-word;
            white-space: pre-wrap;
        `.replace(/\s+/g, ' ').trim()
    });

    function log(msg) {
        const line = document.createElement('div');
        line.textContent = `> ${msg}`;
        loggerUI.appendChild(line);
        loggerUI.scrollTop = loggerUI.scrollHeight;
    }

    window.addEventListener('load', () => {
        const cachedData = localStorage.getItem(STORAGE_KEY);
        if (cachedData) {
            const cache = JSON.parse(cachedData);
            log("Cache loaded.");
            reorganizeUI(cache.series);
            if (cache.date !== new Date().toDateString()) startScan();
        } else {
            startScan();
        }
    });

    const btnContainer = document.createElement('div');
    btnContainer.style = btnContainer_style;
    document.body.appendChild(btnContainer);

    const btn = document.createElement('button');
    btn.innerHTML = 'Full Scan';
    btn.style = btn_style;
    btnContainer.appendChild(btn);

    const btnRefresh = document.createElement('button');
    btnRefresh.innerHTML = 'Check updates';
    btnRefresh.style = btnRefresh_style;
    btnContainer.appendChild(btnRefresh);

    const btnClear = document.createElement('button');
    btnClear.innerHTML = 'Clear cache';
    btnClear.style = btnClear_style;
    btnContainer.appendChild(btnClear);

    btnClear.onclick = () => { localStorage.removeItem(STORAGE_KEY); location.reload(); };
    btn.onclick = () => startScan();

    // Refresh Logic
    btnRefresh.onclick = async () => {
        const cachedData = localStorage.getItem(STORAGE_KEY);
        if (!cachedData) return log("No cache available for verification.");

        let cache = JSON.parse(cachedData);
        let updatesOnly = cache.series.filter(s => s.hasNewContent);

        if (updatesOnly.length === 0) return log("No marked updates to rescan.");

        btnRefresh.disabled = true;
        log(`Checking ${updatesOnly.length} Updates...`);

        for (let i = 0; i < updatesOnly.length; i++) {
            const series = updatesOnly[i];
            btnRefresh.innerHTML = `Check ${i+1}/${updatesOnly.length}`;

            try {
                const details = await checkSeriesDetails(series.url);

                // Falls es nicht mehr neu ist:
                if (!details.hasNewContent) {
                    log(`DONE: ${series.title}`);
                    series.hasNewContent = false;

                    // UI sofort live anpassen
                    const cardWrapper = document.querySelector(`form[action*="/${series.id}"]`)?.closest('div[class*="col-"]') ||
                                        document.querySelector(`.tm-highlight img[alt="${series.title}"]`)?.closest('div[class*="col-"]');

                    if (cardWrapper) {
                        const cardInner = cardWrapper.querySelector('.cover-card');
                        if (cardInner) {
                            cardInner.classList.remove('is-new');
                            const badge = cardInner.querySelector('.tm-badge');
                            if (badge) badge.remove();
                        }
                    }
                }
            } catch (e) { log(`Error at ${series.title}`); }
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
        log("Refreshed.");
        btnRefresh.innerHTML = 'Check updates';
        btnRefresh.disabled = false;
    };

    async function startScan() {
        if (btn.disabled) return;
        btn.disabled = true;
        let allSeries = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            btn.innerHTML = `Loading ${page}...`;
            try {
                const html = await fetchPage(page);
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');

                // Dynamic: Search grid elements based on subscription forms
                const cards = Array.from(doc.querySelectorAll('form[action*="/account/subscribed/"]'))
                    .map(form => form.closest('div[class*="col-"]'))
                    .filter(Boolean);

                if (cards.length === 0) { hasMore = false; } else {
                    cards.forEach(card => {
                        const titleTag = card.querySelector('.show-title');
                        const linkTag = card.querySelector('a.show-cover');
                        const imgTag = card.querySelector('img');
                        const id = card.querySelector('form[action*="/account/subscribed/"]')?.action.split('/').pop();
                        if (titleTag && linkTag) {
                            allSeries.push({ id, title: titleTag.innerText.trim(), url: linkTag.href, poster: imgTag ? (imgTag.getAttribute('data-src') || imgTag.src) : '' });
                        }
                    });
                    const nextLink = doc.querySelector(`a[href*="page=${page + 1}"]`);
                    if (nextLink) { page++; await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS/2)); } else { hasMore = false; }
                }
            } catch (e) { hasMore = false; }
        }

        // Deabo-Check & Cache-Merge
        const cachedData = localStorage.getItem(STORAGE_KEY);
        if (cachedData) {
            const cache = JSON.parse(cachedData);
            allSeries = allSeries.map(s => {
                const cachedVersion = cache.series.find(c => c.id === s.id);
                return cachedVersion ? { ...s, hasNewContent: cachedVersion.hasNewContent, nextUnseenSeason: cachedVersion.nextUnseenSeason, nextUnseenSeasonURL: cachedVersion.nextUnseenSeasonURL } : s;
            });
        }

        for (let i = 0; i < allSeries.length; i++) {
            // Only scan if not already known as "New" in the cache (optional, for speed)
            if (allSeries[i].hasNewContent) continue;

            btn.innerHTML = `Check ${i + 1}/${allSeries.length}`;
            try {
                const details = await checkSeriesDetails(allSeries[i].url);
                allSeries[i].hasNewContent = details.hasNewContent;
                allSeries[i].nextUnseenSeason = details.nextUnseenSeason;
                allSeries[i].nextUnseenSeasonURL = details.nextUnseenSeasonURL;
            } catch (e) {}
            await new Promise(r => setTimeout(r, DELAY_BETWEEN_REQUESTS));
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: new Date().toDateString(), series: allSeries }));
        reorganizeUI(allSeries);
        btn.innerHTML = `Full Scan`;
        btn.disabled = false;
    }

    function reorganizeUI(allSeries) {
		// Find a template card and its container
        const templateCard = document.querySelector('form[action*="/account/subscribed/"]')?.closest('div[class*="col-"]');
        const container = templateCard?.parentElement;

		if (!container) return; // To be on the safe side, cancel if there is nothing there.

        // Clean up template classes from our own markers
        const templateClasses = templateCard.className
            .replace(/tm-highlight|tm-placeholder/g, '')
            .trim();

        const updates = allSeries.filter(s => s.hasNewContent);

        document.querySelectorAll('.tm-placeholder').forEach(el => el.remove());

        updates.reverse().forEach(series => {
            let cardWrapper = document.querySelector(`form[action*="/${series.id}"]`)?.closest('div[class*="col-"]');

            if (!cardWrapper) {
				// Clean up template classes from our own markers
                cardWrapper = createPlaceholderCard(series, templateClasses);
            }

            cardWrapper.classList.add('tm-highlight');
            const cardInner = cardWrapper.querySelector('.cover-card');

            if (cardInner) {
                // We add the CSS class for the frame
                cardInner.classList.add('is-new');

                // Only add badge if not already present
                if(!cardInner.querySelector('.tm-badge')) {
					var label = `S${series.nextUnseenSeason}`;
					if (isNaN(series.nextUnseenSeason)) {
						label = series.nextUnseenSeason; // For cases like "Film"
					}
                    const badge = document.createElement('div');
                    badge.className = 'tm-badge';
                    badge.innerText = `${label} NEU`;
                    badge.style = badge_style;
                    cardInner.appendChild(badge);
                }

                const a = (cardInner.tagName === 'A') ? cardInner : cardInner.querySelector('a');
                if (a) {
                    a.href = series.nextUnseenSeasonURL;
                    a.target = "_blank";
                }
            }
            // Push to front
            container.prepend(cardWrapper);
        });
    }

    // Mark placeholders in the creation so that we can delete them specifically.
    function createPlaceholderCard(series, templateClasses) {
        const div = document.createElement('div');

		// We use the classes we have taken from a real card.
        div.className = templateClasses || "col-6 col-sm-4 col-md-3 col-lg-2 mb-3";
        div.classList.add('tm-highlight', 'tm-placeholder');

        div.innerHTML = `
            <div class="seriesCard">
                <a href="${series.nextUnseenSeasonURL}" target="_blank" class="cover-card is-new">
                    <img src="${series.poster}" alt="${series.title}" loading="lazy">
                    <div class="show-title-overlay">
                        <span class="show-title">${series.title}</span>
                    </div>
                </a>
            </div>
        `;
        return div;
    }

    function fetchPage(pageNumber) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({ method: "GET", url: `https://s.to/account/subscribed?order=name-asc&page=${pageNumber}`, onload: (res) => resolve(res.responseText), onerror: reject });
        });
    }

    /*
    async function checkSeriesDetails(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET", url,
                onload: function(res) {
                    const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
                    const epLinks = doc.querySelectorAll('#episode-nav a')
					    , epSeen = doc.querySelectorAll('#episode-nav a.seen')
						, activeS = doc.querySelector('#season-nav a.bg-primary');
                    let hasNew = false, nextS = null, nextSURL = null;
                    if (epLinks.length > 0 && epSeen.length !== epLinks.length) {
                        hasNew = true; nextS = activeS ? activeS.innerText.trim() : "?"; nextSURL = url;
                    } else {
                        const others = Array.from(doc.querySelectorAll('#season-nav a:not(.bg-primary)'));
                        const firstU = others.find(s => !s.classList.contains('seen') && s.innerText.trim() !== "0");
                        if (firstU) { hasNew = true; nextS = firstU.innerText.trim(); nextSURL = new URL(firstU.getAttribute('href'), url).href; }
                    }
                    resolve({ hasNewContent: hasNew, nextUnseenSeason: nextS, nextUnseenSeasonURL: nextSURL });
                },
                onerror: reject
            });
        });
    } //*/

async function checkSeriesDetails(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET", url,
                onload: async function(res) {
                    const doc = new DOMParser().parseFromString(res.responseText, 'text/html');

                    // 1. Check: Gibt es in der AKTUELL geladenen Staffel ungesehene deutsche Folgen?
                    // Dein Selektor ist perfekt: Suche in ungesehenen Zeilen nach der deutschen Flagge
                    const hasGermanInCurrent = doc.querySelectorAll('tr.episode-row:not(.seen) svg.svg-flag-german').length > 0;

                    if (hasGermanInCurrent) {
                        const activeS = doc.querySelector('#season-nav a.bg-primary');
                        return resolve({
                            hasNewContent: true,
                            nextUnseenSeason: activeS ? activeS.innerText.trim() : "?",
                            nextUnseenSeasonURL: url
                        });
                    }

                    // 2. Check: Wenn in der aktuellen Staffel nichts ist, andere ungesehene Staffeln finden
                    const nextUnseenSeasonLink = Array.from(doc.querySelectorAll('#season-nav a'))
                        .find(s => !s.classList.contains('seen') && s.innerText.trim() !== "0" && !s.classList.contains('bg-primary'));

                    if (nextUnseenSeasonLink) {
                        const seasonURL = new URL(nextUnseenSeasonLink.getAttribute('href'), url).href;
                        const seasonName = nextUnseenSeasonLink.innerText.trim();

                        // Wir laden die nächste potenzielle Staffel
                        try {
                            const sRes = await new Promise((resS, rejS) => {
                                GM_xmlhttpRequest({ method: "GET", url: seasonURL, onload: resS, onerror: rejS });
                            });
                            const sDoc = new DOMParser().parseFromString(sRes.responseText, 'text/html');

                            // Auch hier: Dein neuer Selektor
                            const hasGermanInNext = sDoc.querySelectorAll('tr.episode-row:not(.seen) svg.svg-flag-german').length > 0;

                            if (hasGermanInNext) {
                                return resolve({
                                    hasNewContent: true,
                                    nextUnseenSeason: seasonName,
                                    nextUnseenSeasonURL: seasonURL
                                });
                            }
                        } catch (e) {}
                    }

                    resolve({ hasNewContent: false });
                },
                onerror: reject
            });
        });
    }


})();