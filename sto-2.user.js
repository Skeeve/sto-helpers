// ==UserScript==
// @name         sto-2 send stream URL to JD
// @namespace    http://tampermonkey.net/
// @author       https://github.com/Skeeve with some help from Gemini
// @version      8.3
// @downloadURL  https://github.com/Skeeve/sto-helpers/raw/refs/heads/main/sto-2.user.js
// @updateURL    https://github.com/Skeeve/sto-helpers/raw/refs/heads/main/sto-2.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @grant        GM_log
// @run-at       document-start
// @description  Follow to the selected hoster
// @match        https://s.to/serie/*/staffel-*/episode-*
// @match        https://serienstream.to/serie/*/staffel-*/episode-*
// ==/UserScript==

(function() {
    'use strict';

    // These episodes I want to get in english
    var inEnglish= [
        'The Orville',
        'Hazbin Hotel',
        'Link Click',
        /* 'Death in Paradise',*/
        /* 'Young Sheldon',*/
        'The Big Bang Theory',
        /* 'Doctor Who', */
        'ES: Welcome to Derry',
    ];

    // My default location for storing stuff
    const TARGET='/Users/shk/Downloads/jdyt/Mediatheken/Serien'; /*
    const TARGET='/Volumes/INTENSO/Serien';
    //*/

    // A tag used to signal to jDownloader what to do with the links
    const TAG4JD='#S-TO#';

    // flashgot link of jDownloader
    const JDOWNLOADER="http://127.0.0.1:9666/flashgot";

    // Close the "download window" when done
	const CloseWhenDone = true;

//////////////////////////////////////////////////////////////////////////////////////////////////

    // 1. SAVE ORIGINAL METHODS (before the site kills them)
    const realQuerySelector = Document.prototype.querySelector;
    const realQuerySelectorAll = Document.prototype.querySelectorAll;
    const realGetElementsByTagName = Document.prototype.getElementsByTagName;
    const realAddEventListener = Element.prototype.addEventListener;
    const realElemQueryAll = Element.prototype.querySelectorAll;
    const realElemQuery = Element.prototype.querySelector;

    // 2. DEBUG-UI (Survives console.clear())
    const loggerUI = GM_addElement(document.documentElement, 'div', {
        id: 'tm-logger',
        style:`
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
            pointer-events: none;
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

    log("Injection successful. Search in progress....");

    // 3. ROBUST GUARD (Polling)
    const checker = setInterval(() => {
        // We always look beyond the prototype
        const h1 = realQuerySelector.call(document, 'h1');
        const h2 = realQuerySelector.call(document, 'h2');

        if (h1 && h2) {
            clearInterval(checker);
            executeMainLogic(h1, h2);
        }
    }, 500);

    // 4. MAIN LOGIC
    function executeMainLogic(h1, h2) {
        log("Target found! Start modification...");

        const targetProvider = document.location.hash.substring(1);
        if (targetProvider == '') {
            alert("No provider selected");
            return;
        }

        const series = h1.textContent.trim();
        const episodeFull = h2.textContent.trim();

        let matches = episodeFull.match(/^S0*(\d+)E0*(\d+):\s*(.*)\s+\((.*)\)/) ||
                      episodeFull.match(/^S0*(\d+)E0*(\d+):\s*((.*))/);

        if (!matches) {
            alert("Cannot retrieve episode information");
            return;
        }

        const season = matches[1], episode = matches[2], titel = matches[3], title = matches[4];

        // Wir holen jetzt ALLE Buttons, nicht nur die vom Wunsch-Provider
        const allButtons = Array.from(realQuerySelectorAll.call(document, 'button[data-play-url]'));

        // Bestimme die Ziel-Sprache basierend auf deiner Liste
        const preferredLang = (inEnglish.indexOf(series) >= 0) ? 'English' : 'Deutsch';
        log("Preferred Language: " + preferredLang);

        let wanted = '';
        let finalTitel = (preferredLang === 'English') ? title : titel;
        let seasondir = (preferredLang === 'English') ? 'Season' : 'Staffel';

        // --- DIE NEUE PRIORITÄTEN-LOGIK ---

        // 1. Suche Wunsch-Provider + Wunsch-Sprache
        let match = allButtons.find(btn =>
            btn.getAttribute('data-hoster-name') === targetProvider &&
            btn.getAttribute('data-language-label') === preferredLang
        );

        // 2. Suche ANDEREN Provider + Wunsch-Sprache
        if (!match) {
            log("Wunsch-Provider hat Wunsch-Sprache nicht. Suche Alternative...");
            match = allButtons.find(btn => btn.getAttribute('data-language-label') === preferredLang);
        }

        // 3. Suche Wunsch-Provider + Beliebige Sprache (Fallback)
        if (!match) {
            log("Wunsch-Sprache nirgends gefunden. Suche Wunsch-Provider mit anderer Sprache...");
            match = allButtons.find(btn => btn.getAttribute('data-hoster-name') === targetProvider);
        }

        // 4. Absoluter Fallback: Irgendwas nehmen
        if (!match && allButtons.length > 0) {
            log("Nehme ersten verfügbaren Stream als Fallback.");
            match = allButtons[0];
        }

        if (match) {
            wanted = match.getAttribute('data-play-url');
            const foundHost = match.getAttribute('data-hoster-name');
            const foundLang = match.getAttribute('data-language-label');
            log(`Found: ${foundHost} (${foundLang})`);

            // Falls wir doch Englisch nehmen mussten (weil kein Deutsch da), Titel anpassen
            if (foundLang === 'English') {
                finalTitel = title;
                seasondir = 'Season';
            }

            const absoluteUrl = new URL(wanted.trim(), window.location.href);
            toJDownloader(absoluteUrl, series, season, episode, finalTitel, seasondir, CloseWhenDone);
        } else {
            alert("Couldn't find any stream at all.");
        }
    }
    /////////////////////// Helpers //////////////////////

    function toJDownloader (link, series, season, episode, title, seasondir, closeWhenDone) {

        // The pckg becomes the Series
        const pckg= series + "##" + fill0(episode, 2) + " - " + title;

        // This will be the download target
        // $TARGET "/Season " SEASON# "/"
        const saveto= TARGET + "/" + series + "/" + seasondir + " " + season;
        log(link.href);
        //if (!confirm(link.href)) { return }
        // return;
        // collect the data to send to JD
        var data= {
            "passwords" : "",
            "source": "",
            "package": pckg,
            "urls": link.href,
            "dir": saveto,
            "submit": "submit"
        };
        // Send the data
        GM_xmlhttpRequest({
            method: "POST",
            url: JDOWNLOADER,
            data: propEncodeURIComponent(data),
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            onload: function(response) {
                if ( response.status === 200 ) {
					if (closeWhenDone) {
						window.close();
					} else {
						log("** DONE **");
					}
                }
                else {
                    log("** Huh? No jDownloader? **");
                }
            },
        });
    }

    function propEncodeURIComponent(obj) {
        var str = [];
        for (var p in obj) {
            if (obj.hasOwnProperty(p)) {
                log(p);
                str.push(encodeURIComponent(p) + "=" + encodeURIComponent(obj[p]));
            }
        }
        return str.join("&");
    }

    // Prepend some zeros
    function fill0(x, num) {
        x= ""+x;
        return "0".repeat(Math.max(2-x.length,0)) + x;
    }


})();
