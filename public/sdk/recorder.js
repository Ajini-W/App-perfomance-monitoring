/*!
 * Session Replay & OpenTelemetry SDK
 * Framework-independent rrweb recorder with official OpenTelemetry Web tracing.
 */
(function () {
  "use strict";
  if (window.__replaySdkLoaded) return;
  window.__replaySdkLoaded = true;

  var script = document.currentScript;
  if (!script) return;
  var siteKey = script.getAttribute("data-site-key");
  if (!siteKey) return console.warn("[replay] data-site-key missing");
  var base = new URL(script.src, location.href);
  var endpoint = script.getAttribute("data-endpoint") || base.origin + "/api/public/ingest";
  var recorderUrl = base.origin + "/sdk/rrweb-record.min.js";
  var otelUrl = base.origin + "/sdk/otel-web.min.js";

  var FLUSH_MS = 4000;
  var MAX_BATCH = 100;

  function uuid() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
    });
  }

  // One session per browser tab; survives refreshes and full-page navigation.
  var sessionId;
  try {
    sessionId = sessionStorage.getItem("__replay_sid");
    if (!sessionId) {
      sessionId = uuid();
      sessionStorage.setItem("__replay_sid", sessionId);
    }
  } catch (e) {
    sessionId = uuid();
  }

  function moduleName() {
    var meta = document.querySelector('meta[name="replay-module"]');
    return (
      script.getAttribute("data-module") ||
      (meta && meta.getAttribute("content")) ||
      (document.body && document.body.getAttribute("data-replay-module")) ||
      document.title ||
      location.pathname
    ).slice(0, 200);
  }

  var visit = null; // { id, module, url, path, startedAt, seq, buffer, spans, stop, disabled }
  var timer = null;

  function send(v, events, spans, ended, useBeacon) {
    if (v.disabled) return;
    var body = JSON.stringify({
      siteKey: siteKey,
      sessionId: sessionId,
      visit: { id: v.id, module: v.module, url: v.url, path: v.path, startedAt: v.startedAt },
      seq: v.seq++,
      events: events,
      spans: spans || [],
      ended: !!ended,
    });

    if (useBeacon && body.length < 60000) {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: body,
        keepalive: true,
        credentials: "omit",
      }).catch(function () {});
      return;
    }

    var attempt = 0;
    (function post() {
      fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: body,
        keepalive: body.length < 60000,
        credentials: "omit",
      })
        .then(function (res) {
          if (res.status === 403)
            v.disabled = true; // page not permitted / site key invalid
          else if (!res.ok && attempt++ < 3) setTimeout(post, 1000 * attempt);
        })
        .catch(function () {
          if (attempt++ < 3) setTimeout(post, 1000 * attempt);
        });
    })();
  }

  function flush(ended, useBeacon) {
    if (!visit) return;
    if (!visit.buffer.length && !visit.spans.length && !ended) return;
    var events = visit.buffer.splice(0, visit.buffer.length);
    var spans = visit.spans.splice(0, visit.spans.length);
    send(visit, events, spans, ended, useBeacon);
  }

  function startVisit() {
    if (visit) {
      flush(true);
      if (visit.stop) visit.stop();
    }
    var v = {
      id: uuid(),
      module: moduleName(),
      url: location.href.split("#")[0].slice(0, 2000),
      path: location.pathname,
      startedAt: new Date().toISOString(),
      seq: 0,
      buffer: [],
      spans: [],
      stop: null,
      disabled: false,
    };
    visit = v;

    if (window.rrwebRecord) {
      v.stop = window.rrwebRecord({
        emit: function (event) {
          if (visit !== v) return;
          v.buffer.push(event);
          if (v.buffer.length >= MAX_BATCH) flush(false);
        },
        maskAllInputs: true,
        maskInputOptions: {
          password: true,
          email: true,
          tel: true,
          text: true,
          textarea: true,
          select: true,
        },
        blockClass: "rr-block",
        maskTextClass: "rr-mask",
        recordCanvas: false,
        collectFonts: false,
      });
    }

    setTimeout(function () {
      if (visit === v) v.module = moduleName();
    }, 300);
  }

  function onRouteChange() {
    var path = location.pathname + location.search;
    if (visit && path === visit.lastPath) return;
    startVisit();
    visit.lastPath = path;
  }

  function patchHistory(name) {
    var orig = history[name];
    history[name] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(onRouteChange, 0);
      return r;
    };
  }

  function initOtel() {
    if (window.__otelInited || !window.__initOtelTracer) return;
    window.__otelInited = true;
    window.__initOtelTracer({
      serviceName: document.title || "web-browser",
      onSpan: function (span) {
        if (visit && !visit.disabled) {
          visit.spans.push(span);
          if (visit.spans.length >= MAX_BATCH) flush(false);
        }
      },
    });
  }

  function boot() {
    patchHistory("pushState");
    patchHistory("replaceState");
    window.addEventListener("popstate", function () {
      setTimeout(onRouteChange, 0);
    });
    window.addEventListener("hashchange", function () {
      setTimeout(onRouteChange, 0);
    });
    window.addEventListener("pagehide", function () {
      flush(true, true);
    });
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flush(false, true);
    });
    onRouteChange();
    timer = setInterval(function () {
      flush(false);
    }, FLUSH_MS);
  }

  function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  }

  function loadScript(src, done) {
    var s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = done;
    s.onerror = done;
    document.head.appendChild(s);
  }

  function startAll() {
    ready(function () {
      boot();
      initOtel();
    });
  }

  var pending = 2;
  function checkDone() {
    pending--;
    if (pending <= 0) startAll();
  }

  if (window.rrwebRecord) checkDone();
  else loadScript(recorderUrl, checkDone);

  if (window.__initOtelTracer) checkDone();
  else
    loadScript(otelUrl, function () {
      initOtel();
      checkDone();
    });
})();
