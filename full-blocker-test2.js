/**
 * Full Blocker Script v3.0
 * By: Farhan (海鹏 鸟神 / Hanzet22)
 * Purpose: Auto-block notifications, cookies, cache, permission requests
 *          + AGGRESSIVE POLLING cookie banner dismiss (multilingual)
 *          + Early injection before DOM ready
 * Host: GitHub Raw → PCAPdroid JS Injector
 * Updated: v3.0 — Aggressive polling, early run, timing fix
 * version Test
 */

(function () {
    'use strict';

    const TAG = '[FULL-BLOCKER]';

    function log(type, msg) {
        console.warn(TAG + ' [' + type + '] ' + msg);
    }

    // ─── 1. BLOKIR NOTIFICATION API ────────────────────────
    Object.defineProperty(window, 'Notification', {
        get: function () {
            return {
                permission: 'denied',
                requestPermission: function () {
                    log('NOTIF', 'Request blocked — auto denied');
                    return Promise.resolve('denied');
                }
            };
        },
        configurable: false
    });

    // ─── 2. BLOKIR PERMISSION API ──────────────────────────
    if (navigator.permissions) {
        navigator.permissions.query = function (descriptor) {
            log('PERMISSION', 'Query blocked: ' + descriptor.name);
            return Promise.resolve({ state: 'denied', onchange: null });
        };
    }

    // ─── 3. BLOKIR SERVICE WORKER ──────────────────────────
    if ('serviceWorker' in navigator) {
        Object.defineProperty(navigator, 'serviceWorker', {
            get: function () { log('SW', 'Blocked'); return undefined; },
            configurable: false
        });
    }

    // ─── 4. BLOKIR COOKIE ──────────────────────────────────
    const _cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
        || Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
    if (_cookieDesc && _cookieDesc.configurable) {
        Object.defineProperty(document, 'cookie', {
            get: function () { log('COOKIE', 'Read blocked'); return ''; },
            set: function (val) { log('COOKIE', 'Write blocked: ' + val.substring(0, 80)); },
            configurable: false
        });
    }

    // ─── 5. BLOKIR STORAGE ─────────────────────────────────
    const storageBlocker = {
        getItem: function (k) { log('STORAGE', 'getItem blocked: ' + k); return null; },
        setItem: function (k) { log('STORAGE', 'setItem blocked: ' + k); },
        removeItem: function (k) { log('STORAGE', 'removeItem blocked: ' + k); },
        clear: function () { log('STORAGE', 'clear blocked'); },
        length: 0, key: function () { return null; }
    };
    try {
        Object.defineProperty(window, 'localStorage', { get: function () { return storageBlocker; }, configurable: false });
        Object.defineProperty(window, 'sessionStorage', { get: function () { return storageBlocker; }, configurable: false });
    } catch (e) { log('STORAGE', 'Override failed: ' + e.message); }

    // ─── 6. BLOKIR INDEXEDDB ───────────────────────────────
    if (window.indexedDB) {
        Object.defineProperty(window, 'indexedDB', {
            get: function () { log('IDB', 'Blocked'); return undefined; },
            configurable: false
        });
    }

    // ─── 7. BLOKIR CACHE API ───────────────────────────────
    if ('caches' in window) {
        Object.defineProperty(window, 'caches', {
            get: function () {
                return {
                    open: function () { return Promise.reject('blocked'); },
                    match: function () { return Promise.resolve(undefined); },
                    has: function () { return Promise.resolve(false); },
                    delete: function () { return Promise.resolve(false); },
                    keys: function () { return Promise.resolve([]); }
                };
            },
            configurable: false
        });
    }

    // ─── 8. BLOKIR POPUP ───────────────────────────────────
    window.confirm = function (msg) { log('POPUP', 'Confirm blocked: ' + msg); return false; };
    window.alert   = function (msg) { log('POPUP', 'Alert blocked: ' + msg); };
    window.prompt  = function (msg) { log('POPUP', 'Prompt blocked: ' + msg); return null; };

    // ─── 9. BLOKIR PUSH API ────────────────────────────────
    if ('PushManager' in window) {
        Object.defineProperty(window, 'PushManager', {
            get: function () { log('PUSH', 'Blocked'); return undefined; },
            configurable: false
        });
    }

    // ─── 10. AGGRESSIVE BANNER DISMISS ─────────────────────
    // Multilingual dismiss keywords — semua bahasa
    const DISMISS_KEYWORDS = [
        // English
        'accept','accept all','agree','ok','okay','got it',
        'i understand','close','dismiss','continue','allow',
        'i agree','confirm','allow all','done','understood',
        // Indonesian/Malay
        'setuju','oke','mengerti','tutup','lanjutkan',
        'izinkan','ya','konfirmasi','saya setuju','paham',
        // Japanese
        '理解しました','同意する','OK','閉じる',
        '承認','許可','続ける','はい','わかりました',
        '同意','了解','確認',
        // Chinese Simplified
        '同意','接受','确定','关闭','继续','好的','我知道了',
        // Chinese Traditional
        '同意','接受','確定','關閉','繼續','好的','我知道了',
        // Korean
        '동의','확인','닫기','계속','허용','알겠습니다',
        // French
        'accepter','accepter tout',"j'accepte",'fermer',
        "d'accord",'continuer','compris',
        // German
        'akzeptieren','alle akzeptieren','zustimmen',
        'schließen','einverstanden','verstanden','weiter',
        // Spanish
        'aceptar','aceptar todo','de acuerdo','cerrar',
        'entendido','continuar','permitir',
        // Portuguese
        'aceitar','aceitar tudo','concordo','fechar',
        'entendi','continuar','permitir',
        // Russian
        'принять','принять все','согласен','закрыть','ок','понятно',
        // Arabic
        'موافق','قبول','إغلاق','متابعة','حسناً',
        // Thai
        'ยอมรับ','ตกลง','ปิด','ดำเนินการต่อ','เข้าใจแล้ว',
        // Vietnamese
        'chấp nhận','đồng ý','đóng','tiếp tục','tôi hiểu',
        // Hindi
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
        const btns = el.querySelectorAll(
            'button,[role="button"],a[href="#"],input[type="button"],input[type="submit"]'
        );
        for (let btn of btns) {
            const t = (btn.innerText || btn.textContent || btn.value || '').toLowerCase().trim();
            if (DISMISS_KEYWORDS.some(function(k) { return t === k.toLowerCase() || t.includes(k.toLowerCase()); })) {
                log('DISMISS', 'Clicked: "' + t.substring(0, 40) + '"');
                try { btn.click(); } catch(e) {}
                return true;
            }
        }
        return false;
    }

    function hideBanner(el) {
        el.style.cssText += ';display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important;';
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        log('BANNER', 'Hidden: ' + (el.id || el.className || '').toString().substring(0, 50));
    }

    function isBanner(el) {
        if (!el) return false;
        const text = (el.innerText || el.textContent || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const cls = (el.className || '').toString().toLowerCase();
        return BANNER_KEYWORDS.some(function(k) {
            return text.includes(k.toLowerCase()) ||
                   id.includes(k.toLowerCase()) ||
                   cls.includes(k.toLowerCase());
        });
    }

    function scanBanners() {
        // Via CSS selectors
        BANNER_SELECTORS.forEach(function(sel) {
            try {
                document.querySelectorAll(sel).forEach(function(el) {
                    const clicked = tryDismiss(el);
                    if (!clicked && el.offsetHeight > 0) hideBanner(el);
                });
            } catch(e) {}
        });

        // Via text scan
        try {
            document.querySelectorAll('div,section,aside,nav,footer,[role="dialog"]').forEach(function(el) {
                if (isBanner(el) && el.offsetHeight > 30 && el.offsetHeight < window.innerHeight * 0.8) {
                    const clicked = tryDismiss(el);
                    if (!clicked) hideBanner(el);
                }
            });
        } catch(e) {}

        // Remove iframes suspicious
        try {
            document.querySelectorAll('iframe').forEach(function(f) {
                const src = f.src || '';
                if (['ads','track','click','pop','redirect','banner'].some(function(k){ return src.includes(k); })) {
                    log('IFRAME','Removed: ' + src.substring(0,60));
                    f.remove();
                }
            });
        } catch(e) {}
    }

    // ─── 11. AGGRESSIVE POLLING ────────────────────────────
    // Run immediately + every 200ms for first 10 seconds
    // Then every 2s after that (long run friendly)

    var _pollCount = 0;
    var _fastPoll = setInterval(function() {
        scanBanners();
        _pollCount++;
        if (_pollCount >= 50) { // 50 x 200ms = 10 detik
            clearInterval(_fastPoll);
            log('POLL', 'Fast polling done — switching to slow poll');
            // Switch ke slow poll buat long run
            setInterval(scanBanners, 2000);
        }
    }, 200);

    // ─── 12. MUTATION OBSERVER ─────────────────────────────
    var _observer = new MutationObserver(function(mutations) {
        var shouldScan = false;
        mutations.forEach(function(m) {
            if (m.addedNodes.length > 0) shouldScan = true;
        });
        if (shouldScan) scanBanners();
    });

    function startObserver() {
        var target = document.body || document.documentElement;
        if (target) {
            _observer.observe(target, { childList: true, subtree: true });
            log('OBS', 'MutationObserver active');
        }
    }

    // ─── 13. INIT ───────────────────────────────────────────
    // Run immediately (before DOM ready)
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

    window.addEventListener('load', function() {
        scanBanners();
    });

    // ─── 14. LOG + MANUAL TOOLS ────────────────────────────
    window.__blockerLog = [];
    var _origWarn = console.warn;
    console.warn = function() {
        var msg = Array.from(arguments).join(' ');
        if (msg.startsWith(TAG)) {
            window.__blockerLog.push({ time: new Date().toISOString(), msg: msg });
        }
        _origWarn.apply(console, arguments);
    };

    window.__showBlockerLog = function() {
        console.table(window.__blockerLog);
        return window.__blockerLog;
    };

    window.__rescan = function() {
        scanBanners();
        log('MANUAL', 'Rescan triggered');
    };

    log('INIT', 'Full Blocker v3.0 ACTIVE — ' + window.location.href);
    console.info(TAG + ' v3.0 | Commands: __showBlockerLog() | __rescan()');

})();
