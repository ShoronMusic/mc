// ==UserScript==
// @name				 YT to WP - YouTube動画をWP新規投稿で開く
// @namespace 	 http://tampermonkey.net/
// @version 		 1.0
// @description  YouTube動画ページからアーティスト・タイトルを抽出し、WordPressの新規投稿を開く
// @match 			 https://www.youtube.com/watch*
// @grant 			 none
// ==/UserScript==

(function () {
	'use strict';

	var exclusionArtists = ["AC/DC", "Allie X", "Anderson .Paak & The Free Nationals", "Belle and Sebastian", "Bob Marley and The Wailers", "Chance the Rapper", "Coheed and Cambria", "D'Angelo and The Vanguard", "Florence + Machine", "Florence + The Machine", "Guns N' Roses", "Hit-Boy", "Kanye West & Jay-Z", "Leigh-Anne", "Mumford & Sons", "Ne-Yo", "nothing,nowhere.", "Outkast", "Pete & Bas", "Peter Bjorn and John", "piri & tommy", "Q-Tip", "Salt-N-Pepa", "Simon & Garfunkel", "Simon and Garfunkel", "T-Pain", "Tones and I","Prince & The Revolution","Prince & The New Power Generation","Haute & Freddy"];
	var artistNameMapping = { "Mike Clark Jr.": "Mike Clark Jr", "Anne Marie": "Anne-Marie", "mgk": "Machine Gun Kelly", "BEYOND THE BLACK": "Beyond the Black" };

	function splitMultipleArtists(artistStr) {
		var artists = [], parts = [artistStr], tempParts = [];
		var i, part;
		for (i = 0; i < parts.length; i++) {
			part = parts[i];
			tempParts = tempParts.concat(part.includes(" x ") ? part.split(/\s+x\s+/) : [part]);
		}
		parts = tempParts; tempParts = [];
		for (i = 0; i < parts.length; i++) {
			part = parts[i];
			tempParts = tempParts.concat(part.includes(" & ") ? part.split(/\s+&\s+/) : [part]);
		}
		parts = tempParts; tempParts = [];
		for (i = 0; i < parts.length; i++) {
			part = parts[i];
			tempParts = tempParts.concat(/\s+and\s+/i.test(part) ? part.split(/\s+and\s+/i) : [part]);
		}
		parts = tempParts;
		for (i = 0; i < parts.length; i++) {
			var cleaned = parts[i].replace(/^The\s+/i, "").replace(/^and\s+/i, "").replace(/^&\s+/i, "").replace(/^\s+|\s+$/g, "");
			if (cleaned) artists.push(cleaned);
		}
		return artists;
	}

	function separateArtists(text) {
		if (/^__PLACEHOLDER_\d+__$/.test(text)) return text;
		var artists = [], featPatterns = [
			/[\(\[\{]\s*(feat\.?|ft\.?|fet\.?|featuring|with|w\/|w\.?)\s+([^)\]\}]+)[\)\]\}]/gi,
			/\s+(feat\.?|ft\.?|fet\.?|featuring|with|w\/|w\.?)\s+([^"\-\(\)\[\]\{\}]+)/gi,
			/\s+&\s+([^"\-\(\)\[\]\{\}]+)/gi,
			/\s+and\s+([^"\-\(\)\[\]\{\}]+)/gi
		], mainArtist = text, featuredArtists = [], match, i, j;
		for (i = 0; i < featPatterns.length; i++) {
			while ((match = featPatterns[i].exec(text)) !== null) {
				var artist = (match[2] || match[1]).replace(/^The\s+/i, "").replace(/^and\s+/i, "").replace(/^&\s+/i, "").trim();
				if (artist) featuredArtists.push(artist);
				mainArtist = mainArtist.replace(match[0], "").trim();
			}
		}
		mainArtist = mainArtist.replace(/[\(\)\[\]\{\}]/g, "").replace(/\s+/g, " ").trim();
		if (mainArtist) artists.push(mainArtist);
		artists = artists.concat(featuredArtists);
		var xArtists = [];
		for (j = 0; j < artists.length; j++) {
			var a = artists[j];
			xArtists = xArtists.concat(a.includes(" x ") ? a.split(/\s+x\s+/) : [a]);
		}
		artists = xArtists.filter(function (a, idx, self) { return a && self.indexOf(a) === idx; });
		return artists.join(", ");
	}

	function run() {
		try {
			var placeholders = {}, videoTitle = (document.title || "").split(" - YouTube")[0];
			if (!videoTitle) { alert("動画タイトルを取得できませんでした。"); return; }
			videoTitle = videoTitle.replace(/^\(\d+\)\s*/, "").trim();
			exclusionArtists.forEach(function (artist, index) {
				var placeholder = "__PLACEHOLDER_" + index + "__";
				var regex = new RegExp(artist.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "gi");
				placeholders[placeholder] = artist;
				videoTitle = videoTitle.replace(regex, placeholder);
			});

			var videoURL = window.location.href, videoID = "";
			var urlMatch = videoURL.match(/[?&]v=([^&]+)/);
			if (!urlMatch) { alert("動画IDを取得できませんでした。"); return; }
			videoID = urlMatch[1];

			var publishDate = "";
			try {
				var allText = (document.body && document.body.innerText) ? document.body.innerText : "";
				var datePatterns = [/\b\d{4}\/\d{2}\/\d{2}\b/, /\b\d{4}-\d{2}-\d{2}\b/, /\b\d{4}年\d{1,2}月\d{1,2}日\b/, /\b\d{4}\.\d{2}\.\d{2}\b/, /(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})[日]?/, /\d{4}\/\d{1,2}\/\d{1,2}/, /\d{4}-\d{1,2}-\d{1,2}/];
				if (allText) {
					for (var di = 0; di < datePatterns.length; di++) {
						var dateMatch = allText.match(datePatterns[di]);
						if (dateMatch) { publishDate = dateMatch[0]; break; }
					}
				}
				if (!publishDate) {
					var selectors = ["#info-container", "#description", "#meta-contents", ".ytd-video-primary-info-renderer", ".ytd-video-secondary-info-renderer", "[id*='info']", "[class*='info']"];
					for (var sj = 0; sj < selectors.length; sj++) {
						var el = document.querySelector(selectors[sj]);
						if (el && el.innerText) {
							for (var di = 0; di < datePatterns.length; di++) {
								dateMatch = el.innerText.match(datePatterns[di]);
								if (dateMatch) { publishDate = dateMatch[0]; break; }
							}
							if (publishDate) break;
						}
					}
				}
			} catch (e) { console.warn("公開日の取得に失敗:", e); }

			var searchQuery = "";
			try {
				var searchBox = document.querySelector("input#search");
				if (searchBox && searchBox.value) searchQuery = searchBox.value.replace(/\(\d+\)/g, "").trim();
			} catch (e) {}

			var artistPart = "", titlePart = "";
			var separatorPattern = /[-\u2013\u2014\u2015]|\s*-\s*|\s*–\s*|\s*—\s*/;
			var doubleQuoteMatch = videoTitle.match(/^([^"]+)\s+"([^"]+)"\s*(.*)$/);
			if (doubleQuoteMatch) {
				artistPart = doubleQuoteMatch[1].trim();
				titlePart = doubleQuoteMatch[2].trim();
			} else {
				var singleQuoteMatch = videoTitle.match(/^([^']+)\s+'([^']+)'\s*(.*)$/);
				if (singleQuoteMatch) {
					artistPart = singleQuoteMatch[1].trim();
					titlePart = singleQuoteMatch[2].trim();
				} else {
					var parts = videoTitle.split(separatorPattern);
					if (parts.length > 1) {
						var rawArtistPart = parts[0].trim(), rawTitlePart = parts.slice(1).join(" - ").trim();
						var ftPatterns = [/(.+?)\s+\((feat\.?|ft\.?|featuring|with)\s+([^)]+)\)/i, /(.+?)\s+(feat\.?|ft\.?|featuring|with)\s+(.+)/i, /(.+?)\s+\[(feat\.?|ft\.?|featuring|with)\s+([^\]]+)\]/i];
						var ftMatch = null;
						for (var p = 0; p < ftPatterns.length; p++) {
							ftMatch = rawTitlePart.match(ftPatterns[p]);
							if (ftMatch) break;
						}
						if (ftMatch) {
							var mainArtist = rawArtistPart.trim(), songTitle = ftMatch[1].trim();
							var featuredArtist = (ftMatch[3] || ftMatch[2]).replace(/\s*\([^)]*Official[^)]*\)/gi, "").replace(/\s*-\s*Official[^-]*$/gi, "").trim();
							var featArtists = splitMultipleArtists(featuredArtist);
							artistPart = [mainArtist].concat(featArtists).join(", ");
							titlePart = songTitle;
						} else {
							artistPart = separateArtists(rawArtistPart);
							titlePart = rawTitlePart;
						}
					} else {
						var artistMatch = searchQuery.split(separatorPattern);
						if (artistMatch.length > 1) {
							artistPart = separateArtists(artistMatch[0].trim());
							titlePart = artistMatch.slice(1).join(" - ").trim();
						} else {
							titlePart = videoTitle.trim();
							artistPart = separateArtists(titlePart);
						}
					}
				}
			}

			for (var ph in placeholders) {
				if (placeholders.hasOwnProperty(ph)) {
					var re = new RegExp(ph, "g");
					artistPart = artistPart.replace(re, placeholders[ph]);
					titlePart = titlePart.replace(re, placeholders[ph]);
				}
			}

			var isExcludedArtist = false;
			for (var ei = 0; ei < exclusionArtists.length; ei++) {
				if (artistPart === exclusionArtists[ei] || artistPart.indexOf(exclusionArtists[ei]) !== -1) { isExcludedArtist = true; break; }
			}
			if (!isExcludedArtist) {
				artistPart = artistPart.split(", ").map(function (a) { return a.replace(/^\s*The\s+/i, "").trim(); }).filter(Boolean).join(", ");
			}
			for (var ph2 in placeholders) {
				if (placeholders.hasOwnProperty(ph2)) {
					var re2 = new RegExp(ph2, "g");
					artistPart = artistPart.replace(re2, placeholders[ph2]);
					titlePart = titlePart.replace(re2, placeholders[ph2]);
				}
			}

			for (var ytName in artistNameMapping) {
				if (artistNameMapping.hasOwnProperty(ytName)) {
					var regex = new RegExp(ytName.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&"), "gi");
					artistPart = artistPart.replace(regex, artistNameMapping[ytName]);
				}
			}

			titlePart = titlePart.replace(/^'\s*(.*?)\s*'$/, "$1").replace(/\s*\|\s*[^|]+$/, "").replace(/["]/g, "").replace(/(Official\s*Music\s*Video|Official\s*Video|OFFICIAL\s*MUSIC\s*VIDEO|Official\s*Audio|Official\s*Visualizer|Official\s*Lyric\s*Video)/gi, "").replace(/\s*\([^)]*Official[^)]*\)/gi, "").replace(/\s*-\s*Official[^-]*$/gi, "").replace(/\s*-\s*$/, "").trim();
			artistPart = artistPart.replace(/^'(.*?)'$/, "$1").replace(/\s*\([^)]*Official[^)]*\)/gi, "").replace(/\s*-\s*Official[^-]*$/gi, "").trim();

			var unnecessaryTexts = ["Visualizer", "Official Video", "Lyric Video", "Music Video", "\\| Vevo", "\\| .*", "\\[Official Music Video\\]", "\\[Official Lyric Video\\]", "\\[Official Video\\]", "//", "AFM Records", "// Official Lyric Video", "\\[Audio\\]", "\\[Lyrics\\]", "\\[HD\\]", "\\[4K\\]", "\\[Explicit\\]", "\\[Clean\\]", "\\[Radio Edit\\]"];
			unnecessaryTexts.forEach(function (text) { titlePart = titlePart.replace(new RegExp(text, "gi"), ""); });
			titlePart = titlePart.replace(/(\([^)]*\)|\[[^\]]*\]|\{[^}]*\})\s*/g, "").replace(/\s+/g, " ").trim();
			artistPart = artistPart.replace(/\s+/g, " ").trim();

			var additionalInfo = {};
			try {
				var searchTexts = [], selectors = ["#info-container", "#description", "#meta-contents", ".ytd-video-primary-info-renderer", ".ytd-video-secondary-info-renderer", "[id*='info']", "[class*='info']", "ytd-video-description-renderer", "ytd-video-description"];
				for (var si = 0; si < selectors.length; si++) {
					var elem = document.querySelector(selectors[si]);
					if (elem && elem.innerText) searchTexts.push(elem.innerText);
				}
				searchTexts.push(document.body.innerText || "");
				var infoText = searchTexts.join("\n");
				var viewCountMatch = infoText.match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*回視聴/);
				if (viewCountMatch) additionalInfo.viewCount = viewCountMatch[1];
				var providedByMatch = infoText.match(/Provided to YouTube by ([^\n]+)/);
				if (providedByMatch) additionalInfo.providedBy = providedByMatch[1];
				var albumMatch = infoText.match(/([^·\n]+)\s*·\s*([^·\n]+)/);
				if (albumMatch) { additionalInfo.songTitle = albumMatch[1].trim(); additionalInfo.artist = albumMatch[2].trim(); }
				var releaseDateMatch = infoText.match(/Released on:\s*(\d{4}-\d{2}-\d{2})/);
				if (releaseDateMatch) additionalInfo.releaseDate = releaseDateMatch[1];
			} catch (e) {}

			if (!artistPart && additionalInfo.artist && additionalInfo.songTitle) {
				artistPart = separateArtists(additionalInfo.artist);
				titlePart = additionalInfo.songTitle;
			}

			if (!artistPart || !titlePart) {
				alert("アーティスト名またはタイトルを正しく抽出できませんでした。\nアーティスト: " + artistPart + "\nタイトル: " + titlePart);
				return;
			}

			artistPart = artistPart.replace(/\s*-\s*$/, "").trim();
			titlePart = titlePart.replace(/^\s*-\s*/, "").trim();

			var wpURL = "https://xs867261.xsrv.jp/md/wp-admin/post-new.php?" + "artist=" + encodeURIComponent(artistPart) + "&title=" + encodeURIComponent(titlePart) + "&original_title=" + encodeURIComponent(videoTitle) + "&youtube_id=" + encodeURIComponent(videoID) + "&publish_date=" + encodeURIComponent(publishDate);
			window.open(wpURL, "myMusicWindow", "width=1000,height=1200");
		} catch (e) {
			console.error("YT to WP エラー:", e);
			alert("エラーが発生しました: " + e.message);
		}
	}

	function addButton() {
		if (document.getElementById("yt-to-wp-btn")) return;
		var btn = document.createElement("button");
		btn.id = "yt-to-wp-btn";
		btn.textContent = "WPで新規投稿";
		btn.style.cssText = "position:fixed;bottom:60px;left:24px;z-index:9999;padding:8px 14px;font-size:13px;cursor:pointer;background:#21759b;color:#fff;border:none;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,.3);";
		btn.onclick = run;
		document.body.appendChild(btn);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", addButton);
	} else {
		addButton();
	}
	if (typeof MutationObserver !== "undefined") {
		var obs = new MutationObserver(function () {
			if (document.querySelector("h1.ytd-video-primary-info-renderer, #title") && !document.getElementById("yt-to-wp-btn")) addButton();
		});
		obs.observe(document.body, { childList: true, subtree: true });
	}
})();
