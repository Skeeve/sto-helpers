// ==UserScript==
// @name         sto-2 send stream URL to JD
// @namespace    http://tampermonkey.net/
// @author       https://github.com/Skeeve with some help from Gemini
// @version      8
// @downloadURL  https://github.com/Skeeve/sto-helpers/raw/refs/heads/main/sto-2.user.js
// @updateURL    https://github.com/Skeeve/sto-helpers/raw/refs/heads/main/sto-2.user.js
// @grant        GM_xmlhttpRequest
// @grant        GM_addElement
// @grant        GM_log
// @run-at       document-start
// @description  Follow to the selected hoster
// @match        https://s.to/serie/*/staffel-*/episode-*
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
    const TARGET='/Users/shk/Downloads/jdyt/Mediatheken/Serien';

    // A tag used to signal to jDownloader what to do with the links
    const TAG4JD='#S-TO#';

    // flashgot link of jDownloader
    const JDOWNLOADER="http://127.0.0.1:9666/flashgot";

    // Close the "download window" when done
	const CloseWhenDone = false;

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

		// The provider is given in the location's hash
        const provider = document.location.hash.substring(1)
        if (provider == '') {
            alert("No provider selected")
            return
        }

		// Get the series name from the first h1
        var series = h1.textContent.trim();
        log("Series: " + series);

		// get the episodes name from the first h2
        const episodeFull = h2.textContent.trim();
        log("Episode: " + episodeFull);
		// Some episodes have the english title in brackets, some don't. So we try both regexes
        var matches = episodeFull.match(/^S0*(\d+)E0*(\d+):\s*(.*)\s+\((.*)\)/);
        if (matches === null) {
			// there was no english title, try again without it
            matches = episodeFull.match(/^S0*(\d+)E0*(\d+):\s*((.*))/);
            if (matches === null) {
                alert("Cannot retrieve episode information from title");
                return;
            }
        }
		// collect the matches and log them
        const season = matches[1];
        const episode = matches[2];
        const titel = matches[3];
        const title = matches[4];
        log("Season: " + season);
        log("Episode: " + episode);
        log("Titel: " + titel);
        log("Title: " + title);

		// get the episode's for our selected provider
        const allProviders = realQuerySelectorAll.call(document,
			'button:has( > img[title="' + provider + '"])'
		);
        if (allProviders.length == 0) {
            alert("Couldn't find provider " + provider);
            return
        }

		// collect the urls for german, english or any, which is any other language.
        var german = '';
        var english = '';
        var any = '';
        allProviders.forEach(btn => {
			// get the language flag from the use-tag of the svg
            const theUse = realElemQuery.call(btn, 'use');
			// the language is the part of the href after the last dash
            const lang = theUse.getAttribute('href').replace(/^.*-/,'');
            log(lang);
			// assign the url to the correct language variable
            switch (lang) {
                case 'german': german=btn.getAttribute('data-play-url');
                    break;
                case 'english': english=btn.getAttribute('data-play-url');
                    break;
                default: any=btn.getAttribute('data-play-url');
            }
        });
		// store german as default
        var wanted = german;
        var theTitle = titel;
        var seasondir = 'Staffel'
		// If we prefer the series in english
		// or if there is no german stream but an english one, we take the english stream
        if (inEnglish.indexOf(series) >= 0 && (english != '' || wanted == '')) {
            wanted = english;
            theTitle = title;
            seasondir = 'Season';
        }
		// If there is no german or english stream but any other one, we take the any stream
        if (wanted == '') {
            wanted = any;
            theTitle = title;
            seasondir = 'Season';
        }
		// If there is no stream at all, we alert the user and stop
        if (wanted == '') {
            alert("Couldn't find any stream")
            return;
        }
		// Combine the url with the current location to get an absolute url and 
		// send it to jDownloader
        const absoluteUrl = new URL(wanted.trim(), window.location.href);
        toJDownloader(absoluteUrl, series, season, episode, theTitle, seasondir, CloseWhenDone);
    }

    /////////////////////// Helpers //////////////////////

    function toJDownloader (link, series, season, episode, title, seasondir, closeWhenDone) {

        // The pckg becomes the Series + the episode
        const pckg= series + '##' + fill0(episode, 2) + " - " + title;

        // This will be the download target
        // $TARGET "/Season " SEASON# "/"
        const saveto= TARGET + "/" + series + "/" + seasondir + " " + season;

        // collect the data to send to JD
        var data= {
            "passwords" : "",
            "source": "",
            "package": pckg,
            "urls": link.href,
            "dir": saveto,
            "submit": "submit"
        };
        log(link.href);
        // Send the data
        GM_xmlhttpRequest({
            method: "POST",
            url: JDOWNLOADER,
            data: objEncodeURIComponent(data),
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

    function objEncodeURIComponent(obj) {
        var str = [];
        for (var p in obj) {
            if (obj.hasOwnProperty(p)) {
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
