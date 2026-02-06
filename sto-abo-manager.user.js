// ==UserScript==
// @name         S.to Abo-Manager Deluxe (Refresh Update)
// @namespace    http://tampermonkey.net/
// @version      2026-02-05.5
// @description  Scannt gezielt nur markierte Updates nach.
// @author       You & Gemini
// @match        https://s.to/account/subscribed*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=s.to
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @grant        GM_addStyle
// ==/UserScript==

(function() {
    'use strict';

    const STORAGE_KEY = 'sto_abo_cache';

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

    // Hide the console with display: none;
    const loggerUI = GM_addElement(document.documentElement, 'div', {
        id: 'tm-logger',
        style:`
            display: none;
            position: fixed;
            top: 0;
            right: 0;
            width: 350px;
            max-height: 450px;
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
            log("Cache geladen.");
            reorganizeUI(cache.series);
            if (cache.date !== new Date().toDateString()) startScan();
        } else {
            startScan();
        }
    });

    const btnContainer = document.createElement('div');
    btnContainer.style = 'position:fixed; bottom:20px; right:20px; z-index:9999; display:flex; gap:10px;';
    document.body.appendChild(btnContainer);

    const btn = document.createElement('button');
    btn.innerHTML = 'Full Scan';
    btn.style = 'padding:10px; background:#27ae60; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;';
    btnContainer.appendChild(btn);

    const btnRefresh = document.createElement('button');
    btnRefresh.innerHTML = 'Updates prüfen';
    btnRefresh.style = 'padding:10px; background:#2980b9; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;';
    btnContainer.appendChild(btnRefresh);

    const btnClear = document.createElement('button');
    btnClear.innerHTML = 'Cache leeren';
    btnClear.style = 'padding:10px; background:#c0392b; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold;';
    btnContainer.appendChild(btnClear);

    btnClear.onclick = () => { localStorage.removeItem(STORAGE_KEY); location.reload(); };
    btn.onclick = () => startScan();

    // DER NEUE REFRESH-LOGIK
    btnRefresh.onclick = async () => {
        const cachedData = localStorage.getItem(STORAGE_KEY);
        if (!cachedData) return log("Kein Cache zum Prüfen vorhanden.");

        let cache = JSON.parse(cachedData);
        let updatesOnly = cache.series.filter(s => s.hasNewContent);

        if (updatesOnly.length === 0) return log("Keine markierten Updates zum Nachscannen.");

        btnRefresh.disabled = true;
        log(`Prüfe ${updatesOnly.length} Updates...`);

        for (let i = 0; i < updatesOnly.length; i++) {
            const series = updatesOnly[i];
            btnRefresh.innerHTML = `Check ${i+1}/${updatesOnly.length}`;

            try {
                const details = await checkSeriesDetails(series.url);

                // Falls es nicht mehr neu ist:
                if (!details.hasNewContent) {
                    log(`ERLEDIGT: ${series.title}`);
                    series.hasNewContent = false;

                    // UI sofort live anpassen
                    const cardWrapper = document.querySelector(`form[action*="/${series.id}"]`)?.closest('.col-6') ||
                                        document.querySelector(`.tm-highlight img[alt="${series.title}"]`)?.closest('.col-6');

                    if (cardWrapper) {
                        const cardInner = cardWrapper.querySelector('.cover-card');
                        cardInner.style.border = "none";
                        cardInner.style.boxShadow = "none";
                        const badge = cardInner.querySelector('.tm-badge');
                        if (badge) badge.remove();
                    }
                }
            } catch (e) { log(`Fehler bei ${series.title}`); }
            await new Promise(r => setTimeout(r, 600));
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
        log("Refresh abgeschlossen.");
        btnRefresh.innerHTML = 'Updates prüfen';
        btnRefresh.disabled = false;
    };

    async function startScan() {
        if (btn.disabled) return;
        btn.disabled = true;
        let allSeries = [];
        let page = 1;
        let hasMore = true;

        while (hasMore) {
            btn.innerHTML = `Lade Seite ${page}...`;
            try {
                const html = await fetchPage(page);
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const cards = doc.querySelectorAll('.col-6.col-sm-4.col-md-3.col-lg-2');
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
                    if (nextLink) { page++; await new Promise(r => setTimeout(r, 300)); } else { hasMore = false; }
                }
            } catch (e) { hasMore = false; }
        }

        for (let i = 0; i < allSeries.length; i++) {
            btn.innerHTML = `Check ${i + 1}/${allSeries.length}`;
            try {
                const details = await checkSeriesDetails(allSeries[i].url);
                allSeries[i].hasNewContent = details.hasNewContent;
                allSeries[i].nextUnseenSeason = details.nextUnseenSeason;
                allSeries[i].nextUnseenSeasonURL = details.nextUnseenSeasonURL;
            } catch (e) {}
            await new Promise(r => setTimeout(r, 600));
        }

        localStorage.setItem(STORAGE_KEY, JSON.stringify({ date: new Date().toDateString(), series: allSeries }));
        reorganizeUI(allSeries);
        btn.innerHTML = `Full Scan`;
        btn.disabled = false;
    }

function reorganizeUI(allSeries) {
        const container = document.querySelector('.row.g-3');
        const updates = allSeries.filter(s => s.hasNewContent);
        if (!container || updates.length === 0) return;

        // Nur die von uns erstellten Platzhalter entfernen,
        // originale Cards behalten wir und modifizieren sie nur
        document.querySelectorAll('.tm-placeholder').forEach(el => el.remove());

        updates.reverse().forEach(series => {
            let cardWrapper = document.querySelector(`form[action*="/${series.id}"]`)?.closest('.col-6');
            let isPlaceholder = false;

            if (!cardWrapper) {
                cardWrapper = createPlaceholderCard(series);
                isPlaceholder = true;
            }

            cardWrapper.classList.add('tm-highlight');
            const cardInner = cardWrapper.querySelector('.cover-card');

            if (cardInner) {
                // Wir fügen die CSS-Klasse für den Rahmen hinzu
                cardInner.classList.add('is-new');

                // Badge nur hinzufügen, wenn noch nicht da
                if(!cardInner.querySelector('.tm-badge')) {
                    const badge = document.createElement('div');
                    badge.className = 'tm-badge';
                    badge.innerText = `S${series.nextUnseenSeason} NEU`;
                    badge.style = "position:absolute; top:5px; left:5px; background:#27ae60; color:white; padding:2px 6px; border-radius:3px; font-weight:bold; font-size:10px; z-index:10;";
                    cardInner.appendChild(badge);
                }

                const a = (cardInner.tagName === 'A') ? cardInner : cardInner.querySelector('a');
                if (a) {
                    a.href = series.nextUnseenSeasonURL;
                    a.target = "_blank";
                }
            }
            // Nach vorne schieben
            container.prepend(cardWrapper);
        });
    }

    // Markiere Platzhalter in der Erstellung, damit wir sie gezielt löschen können
    function createPlaceholderCard(series) {
        const div = document.createElement('div');
        div.className = "col-6 col-sm-4 col-md-3 col-lg-2 mb-3 tm-highlight tm-placeholder";
        div.innerHTML = `<div class="seriesCard"><a href="${series.nextUnseenSeasonURL}" target="_blank" class="cover-card is-new"><img src="${series.poster}" alt="${series.title}" loading="lazy"><div class="show-title-overlay"><span class="show-title">${series.title}</span></div></a></div>`;
        return div;
    }
    function createPlaceholderCard(series) {
        const div = document.createElement('div');
        div.className = "col-6 col-sm-4 col-md-3 col-lg-2 mb-3 tm-highlight";
        div.innerHTML = `<div class="seriesCard"><a href="${series.nextUnseenSeasonURL}" target="_blank" class="cover-card"><img src="${series.poster}" alt="${series.title}" loading="lazy"><div class="show-title-overlay"><span class="show-title">${series.title}</span></div></a></div>`;
        return div;
    }

    function fetchPage(pageNumber) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({ method: "GET", url: `https://s.to/account/subscribed?order=name-asc&page=${pageNumber}`, onload: (res) => resolve(res.responseText), onerror: reject });
        });
    }

    async function checkSeriesDetails(url) {
        return new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: "GET", url,
                onload: function(res) {
                    const doc = new DOMParser().parseFromString(res.responseText, 'text/html');
                    const epLinks = doc.querySelectorAll('#episode-nav a'), epSeen = doc.querySelectorAll('#episode-nav a.seen'), activeS = doc.querySelector('#season-nav a.bg-primary');
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
    }
})();