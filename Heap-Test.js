// ==UserScript==
// @name         heap-guardian
// @namespace    https://github.com/Hanzet22/PCAPDROID-JS-FEATURE
// @version      2.0
// @description  Adaptive Heap Watchdog + Log Cleaner
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
'use strict';

if (window.__heapGuardianActive) return;
window.__heapGuardianActive = true;

const TAG = '[HEAP-GUARD]';
const VERSION = '2.0';

// Base limits
const MAX_ENTRIES = 150;
const TRIM_TO = 30;
const CHECK_INTERVAL = 10000; // 10 detik
const HEAP_WARN_MB = 200;
const HEAP_CRIT_MB = 230;

function log(msg) {
    console.warn(TAG + ' ' + msg);
}

function getHeapMB() {
    if (performance && performance.memory) {
        return performance.memory.usedJSHeapSize / 1024 / 1024;
    }
    return null;
}

function trimLog(name, arr, aggressive = false) {
    if (!arr || !Array.isArray(arr)) return 0;
    const limit = aggressive ? 50 : MAX_ENTRIES;
    const target = aggressive ? 10 : TRIM_TO;

    if (arr.length > limit) {
        const before = arr.length;
        arr.splice(0, arr.length - target);
        return before - arr.length;
    }
    return 0;
}

function purgeAllLogs() {
    let purged = 0;
    ['__hopLog', '__blockerLog', '__redirectLog'].forEach(key => {
        if (Array.isArray(window[key])) {
            purged += window[key].length;
            window[key].length = 0;
        }
    });
    return purged;
}

function aggressiveCleanup() {
    let trimmed = 0;

    trimmed += trimLog('hopLog', window.__hopLog, true);
    trimmed += trimLog('blockerLog', window.__blockerLog, true);
    trimmed += trimLog('redirectLog', window.__redirectLog, true);

    if (window.__blockerAttemptMap && typeof window.__clearAttempts === 'function') {
        window.__clearAttempts();
    }

    return trimmed;
}

function runGuard() {

    let trimmed = 0;

    trimmed += trimLog('hopLog', window.__hopLog);
    trimmed += trimLog('blockerLog', window.__blockerLog);
    trimmed += trimLog('redirectLog', window.__redirectLog);

    const heap = getHeapMB();

    if (heap !== null) {

        if (heap > HEAP_WARN_MB) {
            log('⚠ WARN Heap ' + heap.toFixed(1) + ' MB — aggressive trim');
            aggressiveCleanup();
        }

        if (heap > HEAP_CRIT_MB) {
            log('🚨 CRITICAL Heap ' + heap.toFixed(1) + ' MB — purge mode');
            purgeAllLogs();
        }
    }

    return { trimmed, heap };
}

// SINGLETON INTERVAL
if (window.__heapGuardianInterval) {
    clearInterval(window.__heapGuardianInterval);
}

setTimeout(function () {
    runGuard();
    window.__heapGuardianInterval = setInterval(runGuard, CHECK_INTERVAL);
    log('v' + VERSION + ' ACTIVE | interval ' + (CHECK_INTERVAL/1000) + 's');
}, 5000);

// Manual tools
window.__heapGuard = runGuard;
window.__heapStatus = function () {
    return {
        heapMB: getHeapMB(),
        hopLog: (window.__hopLog || []).length,
        blockerLog: (window.__blockerLog || []).length,
        redirectLog: (window.__redirectLog || []).length
    };
};

log('v' + VERSION + ' loaded');

})();