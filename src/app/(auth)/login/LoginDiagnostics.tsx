"use client";

import { useEffect } from "react";

// Temporary field diagnostics for the 2026-10-24 "login button does nothing"
// reports from mainland WeChat users. Two halves:
//  • an inline script (runs during HTML parse, before Next's chunks) records
//    script errors / failed script loads and, if React has not hydrated within
//    8 s, beacons what it collected;
//  • this component, which only mounts once hydration succeeded, beacons the
//    hydration time plus anything the inline hook caught.
// Both post one line to /api/speedtest/report (stored in speedtest_reports).

const HOOK = `
(function(){
  var d = window.__loginDiag = { errors: [], t0: performance.now(), sent: false };
  window.addEventListener('error', function(e){
    var t = e.target;
    if (t && t !== window && t.tagName) d.errors.push('load-fail ' + t.tagName + ' ' + (t.src||t.href||''));
    else d.errors.push('error ' + (e.message||'') + ' @' + (e.filename||'').split('/').pop() + ':' + e.lineno);
  }, true);
  window.addEventListener('unhandledrejection', function(e){
    d.errors.push('rejection ' + String(e.reason && (e.reason.message || e.reason)).slice(0,200));
  });
  d.send = function(status){
    if (d.sent) return; d.sent = true;
    var res = performance.getEntriesByType('resource').filter(function(r){ return r.name.indexOf('/_next/static/') !== -1; });
    var line = ['login-diag ' + new Date().toISOString(), 'status=' + status,
      'ms=' + Math.round(performance.now() - d.t0), 'scripts=' + document.scripts.length,
      'static=' + res.length, 'errors=' + (d.errors.length ? d.errors.join(' ; ') : 'none'),
      'ua=' + navigator.userAgent].join(' | ');
    try { navigator.sendBeacon('/api/speedtest/report', line); } catch (_) {}
  };
  setTimeout(function(){ if (!window.__loginHydrated) d.send('NOT-HYDRATED'); }, 8000);
})();
`;

export default function LoginDiagnostics() {
  useEffect(() => {
    const w = window as Window & { __loginHydrated?: boolean; __loginDiag?: { send(s: string): void } };
    w.__loginHydrated = true;
    w.__loginDiag?.send("hydrated");
  }, []);
  return <script dangerouslySetInnerHTML={{ __html: HOOK }} />;
}
