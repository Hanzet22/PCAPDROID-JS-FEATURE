// ==UserScript==
// @name         full-blocker-4.1-patch
// @namespace    https://github.com/Hanzet22/PCAPDROID-JS-FEATURE
// @version      4.1.0
// @description  Full Blocker v4.1 Patch Fix Leak — Anomaly Detection + Loop Breaker + Structured Logging
// @author       Farhan (海鹏 鸟神 / Hanzet22)
// @match        *://*/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

/*
 * Full Blocker v4.1 — Hardened Banner & Permission Blocker Patch Code (Fix Leak Heap)
 * ──────────────────────────────────────────────────────────
 * Anomaly Detection : scan spike counter + DOM thrash detect
 * Loop Breaker      : max dismiss attempts per element per session
 * Structured Logging: { t, type, msg, target, count, status }
 * All v4.1 patch features retained + hardened
 */

(function () {
    'use strict';

    const TAG     = '[FULL-BLOCKER]';
    const VERSION = '4.0';

    // ─── STRUCTURED LOGGER ──────────────────────────────────
    var MAX_LOG = 500;
    var _log = [];
function log(type, msg, meta) {
    var entry = {
        t      : new Date().toISOString(),
        type   : type,
        msg    : msg,
        target : (meta && meta.target) || null,
        count  : (meta && meta.count)  || null,
        status : (meta && meta.status) || 'ok'
    };

    _log.push(entry);
    if (_log.length > MAX_LOG) _log.shift(); // 🔥 Bounded

    console.warn(TAG + ' [' + type + '] ' + msg +
        (meta ? ' | ' + JSON.stringify(meta) : ''));
    return entry;
}
    


    // ─── LOOP BREAKER ───────────────────────────────────────
    // Tiap elemen punya max attempt counter
    // Kalau udah di-attempt X kali = skip — hindari infinite loop

    var _attemptMap = new Map(); // WeakMap-style via string key
    var MAX_ATTEMPTS = 3; // max 3x dismiss attempt per elemen

    function getAttemptKey(el) {
        if (!el) return null;
        return (el.id || '') + '|' + (el.className || '').toString().substring(0, 30);
    }

    function canAttempt(el) {
        var key = getAttemptKey(el);
        if (!key) return true;
        var count = _attemptMap.get(key) || 0;
        if (count >= MAX_ATTEMPTS) {
            return false;
        }
        _attemptMap.set(key, count + 1);
        return true;
    }

    // ─── ANOMALY DETECTION ──────────────────────────────────
    var _scanCount   = 0;
    var _dismissCount = 0;
    var _domThrash   = 0;
    var MAX_ANOMALY = 100;
    var _anomalyLog = [];
    var SCAN_SPIKE   = 100; // 100 scan dalam 5 detik = anomaly
    var DISMISS_SPIKE = 50; // 50 dismiss = anomaly

    function trackScan() {
        _scanCount++;
        if (_scanCount === SCAN_SPIKE) {
            var entry = log('ANOMALY', 'Scan spike: ' + _scanCount + ' scans',
                { status: 'anomaly', count: _scanCount });
            _anomalyLog.push(entry);
        }
    }

    function trackDismiss(target) {
        _dismissCount++;
        if (_dismissCount % 10 === 0) {
            log('DISMISS_COUNT', 'Total dismissals: ' + _dismissCount,
                { count: _dismissCount, target: target, status: 'info' });
        }
    }

    function trackDOMThrash(count) {
        _domThrash += count;
        if (_domThrash > 200 && _domThrash % 50 === 0) {
            log('ANOMALY', 'DOM thrash detected: ' + _domThrash + ' mutations',
                { status: 'anomaly', count: _domThrash });
        }
    }

    // ─── 1. BLOKIR NOTIFICATION ─────────────────────────────
    Object.defineProperty(window, 'Notification', {
        get: function() {
            return {
                permission: 'denied',
                requestPermission: function() {
                    log('NOTIF', 'Blocked', { status: 'blocked' });
                    return Promise.resolve('denied');
                }
            };
        },
        configurable: false
    });

    // ─── 2. BLOKIR PERMISSION API ───────────────────────────
    if (navigator.permissions) {
        navigator.permissions.query = function(descriptor) {
            log('PERMISSION', 'Blocked: ' + descriptor.name,
                { target: descriptor.name, status: 'blocked' });
            return Promise.resolve({ state: 'denied', onchange: null });
        };
    }

    // ─── 3. BLOKIR SERVICE WORKER ───────────────────────────
    if ('serviceWorker' in navigator) {
        Object.defineProperty(navigator, 'serviceWorker', {
            get: function() {
                log('SW', 'Blocked', { status: 'blocked' });
                return undefined;
            },
            configurable: false
        });
    }

    // ─── 4. BLOKIR COOKIE ───────────────────────────────────
    var _cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
        || Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
    if (_cookieDesc && _cookieDesc.configurable) {
        Object.defineProperty(document, 'cookie', {
            get: function() {
                log('COOKIE', 'Read blocked', { status: 'blocked' });
                return '';
            },
            set: function(val) {
                log('COOKIE', 'Write blocked',
                    { target: val.substring(0, 60), status: 'blocked' });
            },
            configurable: false
        });
    }

    // ─── 5. BLOKIR STORAGE ──────────────────────────────────
    var storageBlocker = {
        getItem    : function(k) { log('STORAGE','getItem blocked',{target:k,status:'blocked'}); return null; },
        setItem    : function(k) { log('STORAGE','setItem blocked',{target:k,status:'blocked'}); },
        removeItem : function(k) { log('STORAGE','removeItem blocked',{target:k,status:'blocked'}); },
        clear      : function()  { log('STORAGE','clear blocked',{status:'blocked'}); },
        length: 0, key: function() { return null; }
    };
    try {
        Object.defineProperty(window, 'localStorage',
            { get: function() { return storageBlocker; }, configurable: false });
        Object.defineProperty(window, 'sessionStorage',
            { get: function() { return storageBlocker; }, configurable: false });
    } catch(e) {
        log('STORAGE', 'Override failed: ' + e.message, { status: 'error' });
    }

    // ─── 6. BLOKIR INDEXEDDB ────────────────────────────────
    if (window.indexedDB) {
        Object.defineProperty(window, 'indexedDB', {
            get: function() { log('IDB','Blocked',{status:'blocked'}); return undefined; },
            configurable: false
        });
    }

    // ─── 7. BLOKIR CACHE API ────────────────────────────────
    if ('caches' in window) {
        Object.defineProperty(window, 'caches', {
            get: function() {
                return {
                    open   : function() { return Promise.reject('blocked'); },
                    match  : function() { return Promise.resolve(undefined); },
                    has    : function() { return Promise.resolve(false); },
                    delete : function() { return Promise.resolve(false); },
                    keys   : function() { return Promise.resolve([]); }
                };
            },
            configurable: false
        });
    }

    // ─── 8. BLOKIR POPUP ────────────────────────────────────
    window.confirm = function(msg) { log('POPUP','Confirm blocked',{target:msg,status:'blocked'}); return false; };
    window.alert   = function(msg) { log('POPUP','Alert blocked',{target:msg,status:'blocked'}); };
    window.prompt  = function(msg) { log('POPUP','Prompt blocked',{target:msg,status:'blocked'}); return null; };

    // ─── 9. BLOKIR PUSH ─────────────────────────────────────
    if ('PushManager' in window) {
        Object.defineProperty(window, 'PushManager', {
            get: function() { log('PUSH','Blocked',{status:'blocked'}); return undefined; },
            configurable: false
        });
    }

    // ─── 10. BANNER DISMISS ENGINE ──────────────────────────
    const DISMISS_KEYWORDS = [
        'accept','accept all','agree','ok','okay','got it',
        'i understand','close','dismiss','continue','allow',
        'i agree','confirm','allow all','done','understood',
        'setuju','oke','mengerti','tutup','lanjutkan',
        'izinkan','ya','konfirmasi','saya setuju','paham',
        '理解しました','同意する','OK','閉じる','承認','許可',
        '続ける','はい','わかりました','同意','了解','確認',
        '同意','接受','确定','关闭','继续','好的','我知道了',
        '同意','接受','確定','關閉','繼續','好的','我知道了',
        '동의','확인','닫기','계속','허용','알겠습니다',
        'accepter','accepter tout',"j'accepte",'fermer',
        "d'accord",'continuer','compris',
        'akzeptieren','alle akzeptieren','zustimmen',
        'schließen','einverstanden','verstanden','weiter',
        'aceptar','aceptar todo','de acuerdo','cerrar',
        'entendido','continuar','permitir',
        'aceitar','aceitar tudo','concordo','fechar',
        'entendi','continuar','permitir',
        'принять','принять все','согласен','закрыть','ок','понятно',
        'موافق','قبول','إغلاق','متابعة','حسناً',
        'ยอมรับ','ตกลง','ปิด','ดำเนินการต่อ','เข้าใจแล้ว',
        'chấp nhận','đồng ý','đóng','tiếp tục','tôi hiểu',
        'स्वीकार','ठीक है','बंद करें','समझ गया'
    ];

    const BANNER_KEYWORDS = [
        'cookie','cookies','consent','gdpr','privacy',
        'クッキー','Cookie','プライバシー','同意',
        '隐私','隱私','쿠키','개인정보',
        'confidentialité','Datenschutz','privacidad',
        'privacidade','конфиденциальность',
        'ملفات تعريف','คุกกี้','cookie','गोपनीयता'
    ];

    const BANNER_SELECTORS = [
        '[id*="cookie"i]','[class*="cookie"i]',
        '[id*="consent"i]','[class*="consent"i]',
        '[id*="gdpr"i]','[class*="gdpr"i]',
        '[id*="banner"i]','[class*="banner"i]',
        '[id*="notice"i]','[class*="notice"i]',
        '[id*="popup"i]','[class*="popup"i]',
        '[id*="modal"i]','[class*="modal"i]',
        '[id*="overlay"i]','[class*="overlay"i]',
        '[id*="privacy"i]','[class*="privacy"i]',
        '[role="dialog"]','[role="alertdialog"]',
        '#onetrust-banner-sdk','#cookieConsent',
        '.cc-banner','.cookie-notice','.cookie-banner',
        '.cookie-bar','.cookie-popup',
        '#CybotCookiebotDialog','.CookieConsent',
        '[data-cookiebanner]','[data-cookie-consent]'
    ];

    function tryDismiss(el) {
        if (!el || !el.querySelectorAll) return false;

        // Loop breaker — kalau udah MAX_ATTEMPTS, skip
        if (!canAttempt(el)) {
            log('LOOP_BREAK', 'Max attempts reached for element',
                { target: (el.id || el.className || '').toString().substring(0, 40),
                  count: MAX_ATTEMPTS, status: 'skipped' });
            return false;
        }

        var btns = el.querySelectorAll(
            'button,[role="button"],a[href="#"],input[type="button"],input[type="submit"]'
        );
        for (var i = 0; i < btns.length; i++) {
            var btn = btns[i];
            var t = (btn.innerText || btn.textContent || btn.value || '').toLowerCase().trim();
            if (DISMISS_KEYWORDS.some(function(k) {
                return t === k.toLowerCase() || t.includes(k.toLowerCase());
            })) {
                var label = t.substring(0, 40);
                log('DISMISS', 'Clicked: "' + label + '"',
                    { target: label, status: 'clicked' });
                trackDismiss(label);
                try { btn.click(); } catch(e) {}
                return true;
            }
        }
        return false;
    }

    function hideBanner(el) {
        var id = (el.id || el.className || '').toString().substring(0, 50);
        el.style.cssText += ';display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;';
        document.body && (document.body.style.overflow = '');
        document.documentElement && (document.documentElement.style.overflow = '');
        log('BANNER', 'Hidden: ' + id, { target: id, status: 'hidden' });
    }

    function isBanner(el) {
        if (!el) return false;
        var text = (el.innerText || el.textContent || '').toLowerCase();
        var id   = (el.id || '').toLowerCase();
        var cls  = (el.className || '').toString().toLowerCase();
        return BANNER_KEYWORDS.some(function(k) {
            return text.includes(k.toLowerCase()) ||
                   id.includes(k.toLowerCase()) ||
                   cls.includes(k.toLowerCase());
        });
    }

    function scanBanners() {
        trackScan();

        BANNER_SELECTORS.forEach(function(sel) {
            try {
                document.querySelectorAll(sel).forEach(function(el) {
                    var clicked = tryDismiss(el);
                    if (!clicked && el.offsetHeight > 0) hideBanner(el);
                });
            } catch(e) {}
        });

        try {
            document.querySelectorAll('div,section,aside,nav,footer,[role="dialog"]').forEach(function(el) {
                if (isBanner(el) && el.offsetHeight > 30 && el.offsetHeight < window.innerHeight * 0.8) {
                    var clicked = tryDismiss(el);
                    if (!clicked) hideBanner(el);
                }
            });
        } catch(e) {}

        try {
            document.querySelectorAll('iframe').forEach(function(f) {
                var src = f.src || '';
                if (['ads','track','click','pop','redirect','banner'].some(function(k) {
                    return src.includes(k);
                })) {
                    log('IFRAME','Removed',{ target: src.substring(0, 60), status: 'removed' });
                    f.remove();
                }
            });
        } catch(e) {}
    }

    // ─── 11. AGGRESSIVE POLLING ─────────────────────────────
    var _pollCount = 0;
    var _fastPoll = setInterval(function() {
        scanBanners();
        _pollCount++;
        if (_pollCount >= 50) {
            clearInterval(_fastPoll);
            log('POLL','Fast poll done — slow mode',
                { count: _pollCount, status: 'switched' });
            setInterval(scanBanners, 2000);
        }
    }, 200);

    // ─── 12. MUTATION OBSERVER + DOM THRASH DETECT ──────────
    var _observer = new MutationObserver(function(mutations) {
        var addedCount = 0;
        mutations.forEach(function(m) { addedCount += m.addedNodes.length; });
        if (addedCount > 0) {
            trackDOMThrash(addedCount);
            scanBanners();
        }
    });

    function startObserver() {
        var target = document.body || document.documentElement;
        if (target) {
            _observer.observe(target, { childList: true, subtree: true });
            log('OBS','MutationObserver active',{ status: 'ok' });
        }
    }

    // ─── 13. INIT ───────────────────────────────────────────
    scanBanners();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
            scanBanners();
            startObserver();
        });
    } else {
        scanBanners();
        startObserver();
    }

    window.addEventListener('load', scanBanners);
// ─── 14. TOOLS ──────────────────────────────────────────
window.__showBlockerLog = function() {
    console.table(_log);
    return _log;
};

window.__showAnomalyLog = function() {
    console.table(_anomalyLog);
    return _anomalyLog;
};

window.__rescan = function() {
    scanBanners();
    log('MANUAL','Rescan triggered',{status:'manual'});
};

window.__blockerStats = function() {
    return {
        totalScans   : _scanCount,
        totalDismiss : _dismissCount,
        domThrash    : _domThrash,
        loopBreaks   : _attemptMap.size,
        anomalies    : _anomalyLog.length
    };
};
window.__clearAttempts = function() {
    _attemptMap.clear();
    log('LOOP_BREAK','Attempt map cleared',{status:'cleared'});
};

// Auto-clean jika map kebanyakan key (anti memory bloat)
setInterval(function(){
    if (_attemptMap.size > 1000) {
        _attemptMap.clear();
        log('CLEAN','Attempt map auto-cleared',{status:'clean'});
    }
}, 15000);

log('INIT', 'Full Blocker v' + VERSION + ' ACTIVE',
    { status: 'init' });

console.info(TAG + ' v' + VERSION +
    ' | __showBlockerLog()' +
    ' | __showAnomalyLog()' +
    ' | __blockerStats()' +
    ' | __rescan()' +
    ' | __clearAttempts()');

})();
