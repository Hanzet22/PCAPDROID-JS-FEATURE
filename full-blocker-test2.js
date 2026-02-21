/**
 * Full Blocker Script
 * By: Farhan (海鹏 鸟神 / Hanzet22)
 * Purpose: Auto-block notifications, cookies, cache, permission requests
 * Host: GitHub Raw → PCAPdroid JS Injector
 */

(function () {
    'use strict';

    const TAG = '[FULL-BLOCKER]';

    function log(type, msg) {
        console.warn(TAG + ' [' + type + '] ' + msg);
    }

    // ─── 1. BLOKIR NOTIFICATION API ────────────────────────
    // Override Notification permission — selalu denied
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

    // ─── 2. BLOKIR PERMISSION API (kamera, mic, notif, dll) ─
    if (navigator.permissions) {
        const _query = navigator.permissions.query.bind(navigator.permissions);
        navigator.permissions.query = function (descriptor) {
            log('PERMISSION', 'Query blocked: ' + descriptor.name);
            return Promise.resolve({ state: 'denied', onchange: null });
        };
    }

    // ─── 3. BLOKIR SERVICE WORKER (cache source) ───────────
    if ('serviceWorker' in navigator) {
        Object.defineProperty(navigator, 'serviceWorker', {
            get: function () {
                log('SW', 'ServiceWorker access blocked');
                return undefined;
            },
            configurable: false
        });
    }

    // ─── 4. BLOKIR COOKIE ──────────────────────────────────
    // Override document.cookie — read returns empty, write blocked
    const _cookieDesc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')
        || Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');

    if (_cookieDesc && _cookieDesc.configurable) {
        Object.defineProperty(document, 'cookie', {
            get: function () {
                log('COOKIE', 'Read blocked');
                return '';
            },
            set: function (val) {
                log('COOKIE', 'Write blocked: ' + val.substring(0, 80));
            },
            configurable: false
        });
    }

    // ─── 5. BLOKIR localStorage & sessionStorage ───────────
    const storageBlocker = {
        getItem: function (k) {
            log('STORAGE', 'getItem blocked: ' + k);
            return null;
        },
        setItem: function (k, v) {
            log('STORAGE', 'setItem blocked: ' + k);
        },
        removeItem: function (k) {
            log('STORAGE', 'removeItem blocked: ' + k);
        },
        clear: function () {
            log('STORAGE', 'clear blocked');
        },
        length: 0,
        key: function () { return null; }
    };

    try {
        Object.defineProperty(window, 'localStorage', {
            get: function () { return storageBlocker; },
            configurable: false
        });
        Object.defineProperty(window, 'sessionStorage', {
            get: function () { return storageBlocker; },
            configurable: false
        });
    } catch (e) {
        log('STORAGE', 'Override failed: ' + e.message);
    }

    // ─── 6. BLOKIR INDEXEDDB (cache browser level) ─────────
    if (window.indexedDB) {
        Object.defineProperty(window, 'indexedDB', {
            get: function () {
                log('IDB', 'IndexedDB access blocked');
                return undefined;
            },
            configurable: false
        });
    }

    // ─── 7. BLOKIR CACHE API ───────────────────────────────
    if ('caches' in window) {
        Object.defineProperty(window, 'caches', {
            get: function () {
                log('CACHE', 'Cache API blocked');
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

    // ─── 8. BLOKIR POPUP PERMISSION UI ─────────────────────
    // Intercept confirm/alert/prompt yang sering dipake redirect
    const _confirm = window.confirm;
    window.confirm = function (msg) {
        log('POPUP', 'Confirm blocked: ' + msg);
        return false; // auto tolak
    };

    const _alert = window.alert;
    window.alert = function (msg) {
        log('POPUP', 'Alert blocked: ' + msg);
        return; // auto dismiss
    };

    // ─── 9. BLOKIR PUSH API ────────────────────────────────
    if ('PushManager' in window) {
        Object.defineProperty(window, 'PushManager', {
            get: function () {
                log('PUSH', 'PushManager blocked');
                return undefined;
            },
            configurable: false
        });
    }

    // ─── 10. AUTO TOLAK SEMUA PERMISSION REQUEST ───────────
    // Via iframe atau dynamic permission prompts
    document.addEventListener('DOMContentLoaded', function () {
        // Remove semua iframe suspicious
        const iframes = document.querySelectorAll('iframe');
        iframes.forEach(function (f) {
            const src = f.src || '';
            if (src.includes('ads') || src.includes('track') ||
                src.includes('click') || src.includes('pop')) {
                log('IFRAME', 'Removed suspicious iframe: ' + src);
                f.remove();
            }
        });
    }, true);

    // ─── 11. EXPOSE LOG ────────────────────────────────────
    window.__blockerLog = [];
    const _origWarn = console.warn;
    console.warn = function () {
        const msg = Array.from(arguments).join(' ');
        if (msg.startsWith(TAG)) {
            window.__blockerLog.push({ time: new Date().toISOString(), msg });
        }
        _origWarn.apply(console, arguments);
    };

    window.__showBlockerLog = function () {
        console.table(window.__blockerLog);
        return window.__blockerLog;
    };

    log('INIT', 'Full Blocker Active — ' + window.location.href);
    console.info(TAG + ' Loaded. Type __showBlockerLog() to view blocked attempts.');

})();
