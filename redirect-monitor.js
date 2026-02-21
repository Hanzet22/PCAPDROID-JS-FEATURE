/**
 * Redirect Monitor Script
 * By: Farhan (海鹏 鸟神)
 * Purpose: Detect & log suspicious redirects via PCAPdroid JS Injector
 * Host: GitHub Gist → Raw URL → PCAPdroid JS Injector
 */

(function () {
    'use strict';

    const LOG_PREFIX = '[REDIRECT-MONITOR]';
    const redirectLog = [];

    // ─── Utility ───────────────────────────────────────────
    function timestamp() {
        return new Date().toISOString();
    }

    function logEvent(type, detail) {
        const entry = {
            time: timestamp(),
            type: type,
            detail: detail,
            currentURL: window.location.href
        };
        redirectLog.push(entry);
        console.warn(LOG_PREFIX + ' [' + type + '] ' + detail);
    }

    // ─── 1. Override location.assign ───────────────────────
    const _assign = window.location.assign.bind(window.location);
    window.location.assign = function (url) {
        logEvent('ASSIGN', url);
        _assign(url);
    };

    // ─── 2. Override location.replace ──────────────────────
    const _replace = window.location.replace.bind(window.location);
    window.location.replace = function (url) {
        logEvent('REPLACE', url);
        _replace(url);
    };

    // ─── 3. Override window.open ───────────────────────────
    const _open = window.open;
    window.open = function (url, target, features) {
        logEvent('WINDOW_OPEN', url + ' | target: ' + (target || '_blank'));
        return _open.call(window, url, target, features);
    };

    // ─── 4. Monitor href change (polling) ──────────────────
    let lastHref = window.location.href;
    setInterval(function () {
        const current = window.location.href;
        if (current !== lastHref) {
            logEvent('HREF_CHANGE', 'FROM: ' + lastHref + ' → TO: ' + current);
            lastHref = current;
        }
    }, 300);

    // ─── 5. Monitor all anchor clicks ──────────────────────
    document.addEventListener('click', function (e) {
        const anchor = e.target.closest('a');
        if (anchor && anchor.href) {
            logEvent('LINK_CLICK', anchor.href);
        }
    }, true);

    // ─── 6. Monitor fetch & XHR for suspicious domains ─────
    const suspiciousKeywords = [
        'judol', 'slot', 'bet', 'casino', 'ads', 'monetiz',
        'redirect', 'track', 'click', 'promo', 'aff', 'ref='
    ];

    function isSuspicious(url) {
        if (!url) return false;
        const lower = url.toLowerCase();
        return suspiciousKeywords.some(k => lower.includes(k));
    }

    // XHR monitor
    const _xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
        if (isSuspicious(url)) {
            logEvent('XHR_SUSPICIOUS', method + ' → ' + url);
        }
        return _xhrOpen.apply(this, arguments);
    };

    // Fetch monitor
    const _fetch = window.fetch;
    window.fetch = function (input, init) {
        const url = typeof input === 'string' ? input : input?.url;
        if (isSuspicious(url)) {
            logEvent('FETCH_SUSPICIOUS', url);
        }
        return _fetch.apply(this, arguments);
    };

    // ─── 7. Meta refresh detector ──────────────────────────
    document.addEventListener('DOMContentLoaded', function () {
        const metas = document.querySelectorAll('meta[http-equiv="refresh"]');
        metas.forEach(function (meta) {
            logEvent('META_REFRESH', meta.getAttribute('content'));
        });
    });

    // ─── 8. Expose log to console ──────────────────────────
    window.__redirectLog = redirectLog;
    window.__showRedirectLog = function () {
        console.table(redirectLog);
        return redirectLog;
    };

    logEvent('INIT', 'Redirect Monitor Active — ' + window.location.href);
    console.info(LOG_PREFIX + ' Loaded. Type __showRedirectLog() to view all logs.');

})();
