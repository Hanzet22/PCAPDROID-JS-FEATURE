// ==UserScript==
// @name         redirect-monitor
// @namespace    https://github.com/Hanzet22/PCAPDROID-JS-FEATURE
// @version      2.0
// @description  Adaptive Redirect Monitor — Dynamic Rules + Regex Groups + Structured Logging
// @author       Farhan (海鹏 鸟神 / Hanzet22)
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * Redirect Monitor v2.0 — Adaptive Detection Engine
 * ───────────────────────────────────────────────────
 * Dynamic Rule Engine  : rules bisa di-add/remove runtime
 * Regex Pattern Groups : grouped by category (ads, tracking, gambling, malware)
 * Structured Logging   : { t, type, url, category, severity, matched }
 * Anomaly Detection    : spike detect + rapid redirect counter
 * Auto Block           : suspicious redirect auto-blocked kalau severity HIGH
 */

(function () {
    'use strict';

    const TAG     = '[REDIRECT-MON]';
    const VERSION = '2.0';

    // ─── STRUCTURED LOGGER ──────────────────────────────────
    var _log = [];

    function log(type, msg, meta) {
        var entry = {
            t        : new Date().toISOString(),
            type     : type,
            msg      : msg,
            url      : (meta && meta.url)      || null,
            category : (meta && meta.category) || null,
            severity : (meta && meta.severity) || 'info',
            matched  : (meta && meta.matched)  || null
        };
        _log.push(entry);
        console.warn(TAG + ' [' + type + '] ' + msg +
            (meta ? ' | ' + JSON.stringify(meta) : ''));
        return entry;
    }

    // ─── DYNAMIC RULE ENGINE ────────────────────────────────
    // Rules bisa di-add / remove / update runtime
    // Format: { id, category, severity, pattern (RegExp), action }

    var _rules = [

        // ── ADS & MONETIZATION ──
        { id: 'ads_ymcdn',      category: 'ads',      severity: 'HIGH',   pattern: /ymcdn\.org/i },
        { id: 'ads_doubleclick',category: 'ads',      severity: 'HIGH',   pattern: /doubleclick\.net/i },
        { id: 'ads_googlesyn',  category: 'ads',      severity: 'MEDIUM', pattern: /googlesynd/i },
        { id: 'ads_popads',     category: 'ads',      severity: 'HIGH',   pattern: /popads\.|popcash\./i },
        { id: 'ads_exoclick',   category: 'ads',      severity: 'HIGH',   pattern: /exoclick\.|exosrv\./i },
        { id: 'ads_adnxs',      category: 'ads',      severity: 'MEDIUM', pattern: /adnxs\.com/i },
        { id: 'ads_taboola',    category: 'ads',      severity: 'LOW',    pattern: /taboola\.com/i },
        { id: 'ads_outbrain',   category: 'ads',      severity: 'LOW',    pattern: /outbrain\.com/i },
        { id: 'ads_generic',    category: 'ads',      severity: 'MEDIUM', pattern: /\/ads\/|\/ad\/|\/advert|\/banner\//i },

        // ── TRACKING & ANALYTICS ──
        { id: 'track_hotjar',   category: 'tracking', severity: 'LOW',    pattern: /hotjar\.com/i },
        { id: 'track_mixpanel', category: 'tracking', severity: 'LOW',    pattern: /mixpanel\.com/i },
        { id: 'track_segment',  category: 'tracking', severity: 'LOW',    pattern: /segment\.io|segment\.com/i },
        { id: 'track_fb_pixel', category: 'tracking', severity: 'MEDIUM', pattern: /connect\.facebook\.net|fbevents/i },
        { id: 'track_param',    category: 'tracking', severity: 'LOW',    pattern: /[?&](utm_|ref=|aff=|affid=|click_id=)/i },
        { id: 'track_redirect', category: 'tracking', severity: 'MEDIUM', pattern: /\/redirect\?|\/track\?|\/click\?|\/go\?url=/i },

        // ── GAMBLING / JUDOL ──
        { id: 'gamble_slot',    category: 'gambling', severity: 'HIGH',   pattern: /slot|judol|judi|togel|poker|casino|taruhan|bet(ting)?|4d|3d|2d/i },
        { id: 'gamble_tld',     category: 'gambling', severity: 'HIGH',   pattern: /\.(xyz|top|club|icu|buzz)\/.*?(slot|bet|casino)/i },

        // ── MALWARE / PHISHING ──
        { id: 'malware_dl',     category: 'malware',  severity: 'CRITICAL', pattern: /\.exe$|\.apk$|\.bat$|\.cmd$|\.msi$|\.vbs$/i },
        { id: 'malware_crypto', category: 'malware',  severity: 'CRITICAL', pattern: /cryptolocker|ransomware|miner\.js|coinminer/i },
        { id: 'phish_login',    category: 'phishing', severity: 'HIGH',   pattern: /login.*\.(xyz|top|icu|tk|ml|ga|cf)$/i },

        // ── SUSPICIOUS REDIRECT PATTERNS ──
        { id: 'redir_chain',    category: 'redirect', severity: 'MEDIUM', pattern: /\/redir\/|\/forward\/|\/exit\?|\/leave\?|\/outgoing\?/i },
        { id: 'redir_shortener',category: 'redirect', severity: 'LOW',    pattern: /bit\.ly|tinyurl|t\.co|ow\.ly|rebrand\.ly|cutt\.ly/i },
        { id: 'redir_iframe',   category: 'redirect', severity: 'MEDIUM', pattern: /\/pop\.js|popunder|popover/i }
    ];

    // ─── RULE MATCHER ───────────────────────────────────────
    function matchRules(url) {
        if (!url) return null;
        for (var i = 0; i < _rules.length; i++) {
            var rule = _rules[i];
            if (rule.pattern.test(url)) {
                return rule;
            }
        }
        return null;
    }

    // ─── ANOMALY DETECTION ──────────────────────────────────
    var _redirectCount = 0;
    var _redirectWindow = 5000; // 5 detik window
    var _redirectThreshold = 5; // 5 redirect dalam 5 detik = anomaly
    var _redirectTimer = null;
    var _anomalyFired = false;

    function trackRedirect() {
        _redirectCount++;

        if (!_redirectTimer) {
            _redirectTimer = setTimeout(function() {
                _redirectCount = 0;
                _redirectTimer = null;
                _anomalyFired = false;
            }, _redirectWindow);
        }

        if (_redirectCount >= _redirectThreshold && !_anomalyFired) {
            _anomalyFired = true;
            log('ANOMALY', 'Redirect spike detected: ' + _redirectCount + ' in 5s',
                { severity: 'CRITICAL', category: 'anomaly' });
        }
    }

    // ─── AUTO BLOCK ─────────────────────────────────────────
    // Block redirect kalau severity CRITICAL atau HIGH + kategori berbahaya
    function shouldBlock(rule) {
        if (!rule) return false;
        return rule.severity === 'CRITICAL' ||
               (rule.severity === 'HIGH' && ['malware','phishing','gambling'].indexOf(rule.category) !== -1);
    }

    // ─── CORE INTERCEPTORS ──────────────────────────────────

    // 1. location.assign
    var _assign = window.location.assign.bind(window.location);
    window.location.assign = function(url) {
        trackRedirect();
        var rule = matchRules(url);
        var meta = { url: url, category: rule ? rule.category : null,
                     severity: rule ? rule.severity : 'info',
                     matched: rule ? rule.id : null };
        log('ASSIGN', url, meta);
        if (shouldBlock(rule)) {
            log('BLOCKED', 'assign() blocked: ' + url, { url: url, severity: 'CRITICAL' });
            return;
        }
        _assign(url);
    };

    // 2. location.replace
    var _replace = window.location.replace.bind(window.location);
    window.location.replace = function(url) {
        trackRedirect();
        var rule = matchRules(url);
        var meta = { url: url, category: rule ? rule.category : null,
                     severity: rule ? rule.severity : 'info',
                     matched: rule ? rule.id : null };
        log('REPLACE', url, meta);
        if (shouldBlock(rule)) {
            log('BLOCKED', 'replace() blocked: ' + url, { url: url, severity: 'CRITICAL' });
            return;
        }
        _replace(url);
    };

    // 3. window.open
    var _open = window.open;
    window.open = function(url, target, features) {
        trackRedirect();
        var rule = matchRules(url);
        var meta = { url: url, category: rule ? rule.category : null,
                     severity: rule ? rule.severity : 'info',
                     matched: rule ? rule.id : null };
        log('WINDOW_OPEN', url + ' | target: ' + (target || '_blank'), meta);
        if (shouldBlock(rule)) {
            log('BLOCKED', 'window.open() blocked: ' + url, { url: url, severity: 'CRITICAL' });
            return null;
        }
        return _open.call(window, url, target, features);
    };

    // 4. history.pushState + replaceState
    var _pushState = history.pushState;
    history.pushState = function(state, title, url) {
        if (url) {
            var rule = matchRules(String(url));
            log('PUSHSTATE', String(url), {
                url: String(url),
                category: rule ? rule.category : null,
                severity: rule ? rule.severity : 'info',
                matched: rule ? rule.id : null
            });
        }
        return _pushState.apply(this, arguments);
    };

    var _replaceState = history.replaceState;
    history.replaceState = function(state, title, url) {
        if (url) {
            var rule = matchRules(String(url));
            log('REPLACESTATE', String(url), {
                url: String(url),
                category: rule ? rule.category : null,
                severity: rule ? rule.severity : 'info',
                matched: rule ? rule.id : null
            });
        }
        return _replaceState.apply(this, arguments);
    };

    // 5. HREF change polling
    var _lastHref = window.location.href;
    setInterval(function() {
        var current = window.location.href;
        if (current !== _lastHref) {
            trackRedirect();
            var rule = matchRules(current);
            log('HREF_CHANGE', _lastHref + ' → ' + current, {
                url: current,
                category: rule ? rule.category : null,
                severity: rule ? rule.severity : 'info',
                matched: rule ? rule.id : null
            });
            _lastHref = current;
        }
    }, 300);

    // 6. Anchor click monitor
    document.addEventListener('click', function(e) {
        var anchor = e.target.closest('a');
        if (anchor && anchor.href) {
            var rule = matchRules(anchor.href);
            if (rule) {
                log('LINK_CLICK', anchor.href, {
                    url: anchor.href,
                    category: rule.category,
                    severity: rule.severity,
                    matched: rule.id
                });
                if (shouldBlock(rule)) {
                    e.preventDefault();
                    e.stopPropagation();
                    log('BLOCKED', 'Link click blocked: ' + anchor.href,
                        { url: anchor.href, severity: 'CRITICAL' });
                }
            }
        }
    }, true);

    // 7. XHR monitor
    var _xhrOpen = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function(method, url) {
        var rule = matchRules(url);
        if (rule) {
            log('XHR', method + ' → ' + url, {
                url: url, category: rule.category,
                severity: rule.severity, matched: rule.id
            });
        }
        return _xhrOpen.apply(this, arguments);
    };

    // 8. Fetch monitor
    var _fetch = window.fetch;
    window.fetch = function(input, init) {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        var rule = matchRules(url);
        if (rule) {
            log('FETCH', url, {
                url: url, category: rule.category,
                severity: rule.severity, matched: rule.id
            });
            if (shouldBlock(rule)) {
                log('BLOCKED', 'fetch() blocked: ' + url,
                    { url: url, severity: 'CRITICAL' });
                return Promise.reject(new Error('Blocked by redirect-monitor'));
            }
        }
        return _fetch.apply(this, arguments);
    };

    // 9. Meta refresh detector
    document.addEventListener('DOMContentLoaded', function() {
        document.querySelectorAll('meta[http-equiv="refresh"]').forEach(function(meta) {
            var content = meta.getAttribute('content') || '';
            var urlMatch = content.match(/url=(.+)/i);
            var url = urlMatch ? urlMatch[1] : content;
            var rule = matchRules(url);
            log('META_REFRESH', content, {
                url: url, category: rule ? rule.category : null,
                severity: rule ? rule.severity : 'info',
                matched: rule ? rule.id : null
            });
        });
    });

    // ─── TOOLS ──────────────────────────────────────────────
    window.__redirectLog     = _log;
    window.__showRedirectLog = function() { console.table(_log); return _log; };

    window.__filterLog = function(category) {
        var filtered = _log.filter(function(e) { return e.category === category; });
        console.table(filtered);
        return filtered;
    };

    window.__showRules = function() {
        console.table(_rules);
        return _rules;
    };

    window.__addRule = function(id, category, severity, patternStr) {
        _rules.push({
            id: id, category: category, severity: severity,
            pattern: new RegExp(patternStr, 'i')
        });
        log('RULE_ADDED', 'Added rule: ' + id, { category: category, severity: severity });
        return _rules;
    };

    window.__removeRule = function(id) {
        var before = _rules.length;
        _rules = _rules.filter(function(r) { return r.id !== id; });
        log('RULE_REMOVED', 'Removed: ' + id + ' (' + (before - _rules.length) + ' removed)');
        return _rules;
    };

    window.__showAnomalyStatus = function() {
        return {
            count    : _redirectCount,
            threshold: _redirectThreshold,
            window_ms: _redirectWindow,
            fired    : _anomalyFired
        };
    };

    log('INIT', 'Redirect Monitor v' + VERSION + ' ACTIVE — ' + _rules.length + ' rules loaded',
        { severity: 'info', category: 'system' });
    console.info(TAG + ' v' + VERSION +
        ' | __showRedirectLog()' +
        ' | __filterLog(category)' +
        ' | __showRules()' +
        ' | __addRule(id,cat,sev,pattern)' +
        ' | __removeRule(id)' +
        ' | __showAnomalyStatus()');

})();
