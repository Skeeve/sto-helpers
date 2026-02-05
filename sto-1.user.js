// ==UserScript==
// @name         sto-1 Linkage
// @namespace    http://tampermonkey.net/
// @author       https://github.com/Skeeve with some help from Gemini
// @version      8.2
// @downloadURL  https://github.com/Skeeve/sto-helpers/raw/refs/heads/main/sto-1.user.js
// @updateURL    https://github.com/Skeeve/sto-helpers/raw/refs/heads/main/sto-1.user.js
// @description  Change every hoster-link in preparation for the other scripts
// @grant        none
// @match        https://s.to/serie/*
// @exclude      https://s.to/serie/*/staffel-*/episode-*
// ==/UserScript==

// Alle Links auf eine s.to Serien-Seite ändern,
document.querySelectorAll('tr.episode-row').forEach( episode => {
    var url = episode.onclick.toString().replace( /^.*'(\/.*)'.*/s, "$1");
    console.log(url);
    episode.querySelectorAll('img').forEach( img => {
        var linkUrl = url + "#" + img.title;
        // Cursor auf Crosshair setzen, damit man sieht, dass es klickbar ist
		// Pointer ist bereits im Altenobjekt gesetzt
        img.style.cursor = 'crosshair';

        img.addEventListener('click', function(event) {
            // Verhindert, dass der Klick das 'onclick' der Tabellenzeile auslöst
            event.stopPropagation();

            // Öffnet das neue Fenster mit den gewünschten Sicherheitsmerkmalen
            window.open(linkUrl, '_blank', 'noopener,noreferrer');
        });
    });
});
