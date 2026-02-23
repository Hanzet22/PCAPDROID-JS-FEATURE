// ==UserScript==
// @name         heap-guardian
// @namespace    https://github.com/Hanzet22/PCAPDROID-JS-FEATURE
// @version      1.0
// @description  Auto trim script logs — prevent heap buildup from PCAPdroid JS sessions
// @author       Farhan (海鹏 鸟神 / Hanzet22)
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * Heap Guardian v1.0
 * ───────────────────
 * Auto trim __hopLog, __blockerLog, __redirectLog
 * kalau entry > MAX_ENTRIES
 * Jalan tiap interval CHECK_INTERVAL
 * Hint V8 GC dengan nulling unused refs
 */

(function () {
    'use strict';

    const TAG            = '[HEAP-GUARD]';
    const VERSION        = '1.0';
    const MAX_ENTRIES    = 200;  // max log entries per script
    const CHECK_INTERVAL = 60000; // check tiap 60 detik
    const TRIM_TO        = 50;   // trim ke 50 entries terakhir

    function log(msg) {
        console.warn(TAG + ' ' + msg);
    }

    function trimLog(name, arr) {
        if (!arr || !Array.isArray(arr)) return 0;
        if (arr.length > MAX_ENTRIES) {
            var before = arr.length;
            arr.splice(0, arr.length - TRIM_TO);
            var trimmed = before - arr.length;
            log('[TRIM] ' + name + ': ' + before + ' → ' + arr.length + ' (-' + trimmed + ')');
            return trimmed;
        }
        return 0;
    }

    function nullUnused() {
        // Null out expired session data kalau ada
        // Hint ke V8 buat GC collect
        var nulled = 0;

        // Clear attempt map di full-blocker kalau gede
        if (window.__blockerAttemptMap &&
            typeof window.__clearAttempts === 'function') {
            // Cek size via stats
            var stats = window.__blockerStats && window.__blockerStats();
            if (stats && stats.loopBreaks > 500) {
                window.__clearAttempts();
                nulled++;
                log('[NULL] Cleared blocker attempt map');
            }
        }

        return nulled;
    }

    function runGuard() {
        var totalTrimmed = 0;

        // Trim semua log arrays
        totalTrimmed += trimLog('hopLog',      window.__hopLog);
        totalTrimmed += trimLog('blockerLog',  window.__blockerLog);
        totalTrimmed += trimLog('redirectLog', window.__redirectLog);

        // Null unused refs
        var nulled = nullUnused();

        if (totalTrimmed > 0 || nulled > 0) {
            log('[RUN] Trimmed ' + totalTrimmed + ' entries | Nulled ' + nulled + ' refs');
        }

        return { trimmed: totalTrimmed, nulled: nulled };
    }

    // ─── AUTO RUN ───────────────────────────────────────────
    // Wait 10 detik dulu biar script lain load
    setTimeout(function() {
        runGuard(); // first run
        setInterval(runGuard, CHECK_INTERVAL);
        log('v' + VERSION + ' ACTIVE — check every ' + (CHECK_INTERVAL/1000) + 's | max ' + MAX_ENTRIES + ' entries');
    }, 10000);

    // ─── TOOLS ──────────────────────────────────────────────
    window.__heapGuard    = runGuard;
    window.__heapStatus   = function() {
        return {
            hopLog     : (window.__hopLog     || []).length,
            blockerLog : (window.__blockerLog || []).length,
            redirectLog: (window.__redirectLog|| []).length,
            maxEntries : MAX_ENTRIES,
            trimTo     : TRIM_TO
        };
    };

    log('v' + VERSION + ' loaded — first run in 10s');
    console.info(TAG + ' v' + VERSION + ' | __heapGuard() | __heapStatus()');

})();
