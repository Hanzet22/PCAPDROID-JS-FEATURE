// ==UserScript==
// @name         heap-guardian
// @namespace    https://github.com/Hanzet22/PCAPDROID-JS-FEATURE
// @version      1.1
// @description  Auto trim script logs — prevent heap buildup from PCAPdroid JS sessions
// @author       Farhan (海鹏 鸟神 / Hanzet22)
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * Heap Guardian v1.1
 * ───────────────────
 * Auto trim __hopLog, __blockerLog, __redirectLog
 * kalau entry > MAX_ENTRIES
 * Jalan tiap interval CHECK_INTERVAL
 * Hint V8 GC dengan nulling unused refs
 *
 * Changelog v1.0 → v1.1:
 *
 *   [BUG FIX #1] __redirectLog orphan reference
 *     → Tambah existence warning kalau log target undefined saat first run
 *     → Developer sekarang tau kalau ada log yang belum ke-register
 *
 *   [BUG FIX #2] nullUnused() silent fail
 *     → Tambah log('[SKIP]') eksplisit kalau kondisi trigger gak terpenuhi
 *     → Biar debug session gak bingung kenapa nulled selalu 0
 *
 *   [BUG FIX #3] Timer comment / timeline clarity
 *     → Tambah comment eksplisit: first run t=10s, interval mulai t=70s dst
 *     → Guard race condition kalau CHECK_INTERVAL < 10000
 *
 *   [BUG FIX #4] arr.splice() race condition saat concurrent iteration
 *     → Tambah flag window.__heapGuardRunning sebagai mutex sederhana
 *     → runGuard() skip kalau masih jalan (prevent overlap)
 *
 *   [BUG FIX #5] Post-rotate session tidak di-reset di Guard
 *     → Expose window.__heapReset() buat reset internal state
 *     → Auto-hook ke window.__rotateSession (Hopper) kalau ada
 *     → Tambah trimCount tracking per log target
 */

(function () {
    'use strict';

    const TAG            = '[HEAP-GUARD]';
    const VERSION        = '1.1';
    const MAX_ENTRIES    = 200;   // max log entries per script
    const CHECK_INTERVAL = 60000; // check tiap 60 detik
    const TRIM_TO        = 50;    // trim ke 50 entries terakhir
    const INIT_DELAY     = 10000; // delay sebelum first run (ms)

    // ─── FIX #4: Mutex flag — prevent concurrent runGuard() ────
    // JS single-thread, tapi setInterval + manual __heapGuard()
    // bisa overlap kalau user panggil manual pas interval lagi jalan
    var _running = false;

    // ─── FIX #5: Internal trim counter per log ──────────────────
    var _trimCount = { hopLog: 0, blockerLog: 0, redirectLog: 0 };

    function log(msg) {
        console.warn(TAG + ' ' + msg);
    }

    // ─── FIX #1: trimLog dengan existence warning ────────────────
    // v1.0: kalau arr undefined, diam-diam return 0 — dev gak tau
    // v1.1: warn sekali kalau target log belum exist saat first run
    var _warnedMissing = {};
    function trimLog(name, arr) {
        if (!arr || !Array.isArray(arr)) {
            // FIX #1: warn kalau belum pernah warn untuk nama ini
            if (!_warnedMissing[name]) {
                log('[WARN] ' + name + ' belum terdaftar di window — script sumber belum load?');
                _warnedMissing[name] = true;
            }
            return 0;
        }

        // Reset warning kalau arr udah ada (script sumber baru load)
        _warnedMissing[name] = false;

        if (arr.length > MAX_ENTRIES) {
            var before = arr.length;

            // FIX #4: splice tetap jalan, tapi _running flag lindungi dari
            // re-entry — kalau __showHopLog() dipanggil pas ini jalan,
            // console.table dapet snapshot yg bisa incomplete
            // → acceptable trade-off di single-thread JS
            arr.splice(0, arr.length - TRIM_TO);

            var trimmed = before - arr.length;
            _trimCount[name] = (_trimCount[name] || 0) + trimmed;
            log('[TRIM] ' + name + ': ' + before + ' → ' + arr.length +
                ' (-' + trimmed + ') | total trimmed: ' + _trimCount[name]);
            return trimmed;
        }
        return 0;
    }

    // ─── FIX #2: nullUnused() dengan feedback eksplisit ─────────
    // v1.0: kalau kondisi gak terpenuhi, function diam return 0
    // v1.1: log '[SKIP]' biar dev tau kenapa nulled = 0
    function nullUnused() {
        var nulled = 0;

        if (!window.__blockerAttemptMap) {
            // FIX #2: skip tapi jelasin kenapa
            log('[SKIP] __blockerAttemptMap tidak ada — blocker script belum load');
            return 0;
        }

        if (typeof window.__clearAttempts !== 'function') {
            log('[SKIP] __clearAttempts() tidak tersedia — versi blocker lama?');
            return 0;
        }

        var stats = window.__blockerStats && window.__blockerStats();
        if (!stats) {
            log('[SKIP] __blockerStats() tidak tersedia atau return null');
            return 0;
        }

        if (stats.loopBreaks <= 500) {
            // FIX #2: info level, bukan warning — ini kondisi normal
            log('[INFO] loopBreaks=' + stats.loopBreaks + ' < 500 — belum perlu clear');
            return 0;
        }

        // Kondisi terpenuhi — clear
        window.__clearAttempts();
        nulled++;
        log('[NULL] Cleared blocker attempt map (loopBreaks=' + stats.loopBreaks + ')');

        return nulled;
    }

    // ─── FIX #4: runGuard() dengan mutex ────────────────────────
    function runGuard() {
        // FIX #4: skip kalau masih running (concurrent call guard)
        if (_running) {
            log('[SKIP] Guard masih running — skip concurrent call');
            return { trimmed: 0, nulled: 0, skipped: true };
        }

        _running = true;
        var totalTrimmed = 0;

        try {
            // Trim semua log arrays
            totalTrimmed += trimLog('hopLog',      window.__hopLog);
            totalTrimmed += trimLog('blockerLog',  window.__blockerLog);
            totalTrimmed += trimLog('redirectLog', window.__redirectLog);

            // Null unused refs
            var nulled = nullUnused();

            if (totalTrimmed > 0 || nulled > 0) {
                log('[RUN] Trimmed ' + totalTrimmed + ' entries | Nulled ' + nulled + ' refs');
            }

            return { trimmed: totalTrimmed, nulled: nulled, skipped: false };

        } finally {
            // FIX #4: always release mutex, even kalau ada exception
            _running = false;
        }
    }

    // ─── FIX #5: __heapReset() — buat dipanggil post-rotate ────
    // Kalau __rotateSession() di Hopper dipanggil, trim counter
    // jadi stale. Reset di sini biar tracking akurat per-session.
    function heapReset() {
        _trimCount   = { hopLog: 0, blockerLog: 0, redirectLog: 0 };
        _warnedMissing = {};
        log('[RESET] Trim counters & warning flags cleared (post-session rotate)');
    }

    // ─── AUTO RUN ───────────────────────────────────────────────
    // FIX #3: Comment timeline eksplisit
    // t=0s    : Script load, __heapGuard & __heapStatus registered
    // t=10s   : First runGuard() + setInterval mulai
    // t=70s   : Interval run #1 (10s + 60s)
    // t=130s  : Interval run #2 (10s + 60s + 60s) ... dst
    //
    // FIX #3: Guard kalau INIT_DELAY >= CHECK_INTERVAL (edge case config)
    if (INIT_DELAY >= CHECK_INTERVAL) {
        log('[WARN] INIT_DELAY (' + INIT_DELAY + 'ms) >= CHECK_INTERVAL (' +
            CHECK_INTERVAL + 'ms) — potensi overlap timing!');
    }

    setTimeout(function () {
        runGuard(); // first run di t=10s

        // FIX #5: Hook ke __rotateSession Hopper kalau udah ada
        // Kalau belum ada, hook akan di-attempt lagi pas runGuard berikutnya
        hookRotateSession();

        setInterval(function () {
            runGuard();
            // FIX #5: Re-attempt hook tiap interval (kalau Hopper load telat)
            hookRotateSession();
        }, CHECK_INTERVAL);

        log('v' + VERSION + ' ACTIVE — check every ' + (CHECK_INTERVAL / 1000) +
            's | max ' + MAX_ENTRIES + ' entries | first interval at t=' +
            ((INIT_DELAY + CHECK_INTERVAL) / 1000) + 's');

    }, INIT_DELAY);

    // ─── FIX #5: Hook ke Hopper __rotateSession ─────────────────
    var _hooked = false;
    function hookRotateSession() {
        if (_hooked) return;
        if (typeof window.__rotateSession !== 'function') return;

        var _origRotate = window.__rotateSession;
        window.__rotateSession = function () {
            log('[HOOK] __rotateSession dipanggil — auto reset heap counters');
            heapReset();
            return _origRotate.apply(this, arguments);
        };
        _hooked = true;
        log('[HOOK] Successfully hooked ke Hopper __rotateSession()');
    }

    // ─── TOOLS ──────────────────────────────────────────────────
    window.__heapGuard  = runGuard;
    window.__heapReset  = heapReset; // FIX #5: exposed buat manual reset

    window.__heapStatus = function () {
        return {
            hopLog      : (window.__hopLog      || []).length,
            blockerLog  : (window.__blockerLog  || []).length,
            redirectLog : (window.__redirectLog || []).length,
            maxEntries  : MAX_ENTRIES,
            trimTo      : TRIM_TO,
            trimCount   : _trimCount,   // FIX #5: lifetime trim stats
            isRunning   : _running,     // FIX #4: mutex status
            rotateHooked: _hooked       // FIX #5: hook status
        };
    };

    log('v' + VERSION + ' loaded — first run in ' + (INIT_DELAY / 1000) + 's');
    console.info(TAG + ' v' + VERSION +
        ' | __heapGuard() | __heapStatus() | __heapReset()');

})();
