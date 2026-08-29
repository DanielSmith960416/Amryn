/* Amryn™ AI Growth Intelligence® — dashboard behaviour */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ── 1. Revenue chart ─────────────────────────────────────────
     12 months of monthly revenue, in thousands of Rand.        */
  var revenue = [840, 812, 878, 905, 890, 962, 1010, 985, 1064, 1120, 1178, 1240];

  function buildChart() {
    var line = document.getElementById('chartLine');
    var area = document.getElementById('chartArea');
    var pin  = document.getElementById('chartPin');
    if (!line) return;

    var W = 640, H = 260, padY = 26, padX = 7;
    var min = Math.min.apply(null, revenue) * 0.94;
    var max = Math.max.apply(null, revenue) * 1.02;

    var pts = revenue.map(function (v, i) {
      var x = padX + (i / (revenue.length - 1)) * (W - padX * 2);
      var y = H - padY - ((v - min) / (max - min)) * (H - padY * 2);
      return [x, y];
    });

    var d = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
    }).join(' ');

    line.setAttribute('d', d);
    area.setAttribute('d', d + ' L' + (W - padX) + ' ' + H + ' L' + padX + ' ' + H + ' Z');

    var last = pts[pts.length - 1];
    pin.setAttribute('cx', last[0]);
    pin.setAttribute('cy', last[1]);

    // draw the line on first reveal
    var len = line.getTotalLength();
    if (reduced) {
      document.getElementById('chart').classList.add('is-drawn');
      return;
    }
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;

    onceVisible(document.getElementById('chart'), function (el) {
      line.style.transition = 'stroke-dashoffset 1.6s cubic-bezier(.16,1,.3,1)';
      line.style.strokeDashoffset = 0;
      el.classList.add('is-drawn');
    });
  }

  /* ── 2. Health score dial ─────────────────────────────────── */
  function buildScore() {
    var fill = document.querySelector('.score__fill');
    if (!fill) return;
    var r = +fill.getAttribute('r');
    var circ = 2 * Math.PI * r;
    var pct = +fill.dataset.score / 100;

    if (reduced) {
      fill.style.strokeDasharray = (circ * pct) + ' ' + circ;
      return;
    }
    fill.style.strokeDasharray = '0 ' + circ;
    onceVisible(fill.closest('.card'), function () {
      fill.style.strokeDasharray = (circ * pct) + ' ' + circ;
    });
  }

  /* ── 3. Counters ──────────────────────────────────────────── */
  function format(n, dec, comma) {
    var s = dec ? n.toFixed(dec) : String(Math.round(n));
    return comma ? s.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : s;
  }

  function runCounter(el) {
    var target = parseFloat(el.dataset.count);
    var dec    = el.dataset.dec ? +el.dataset.dec : 0;
    var comma  = el.dataset.comma === '1';
    var suffix = el.dataset.suffix || '';

    if (reduced) { el.textContent = format(target, dec, comma) + suffix; return; }

    var start = performance.now(), dur = 1100;
    (function step(now) {
      var t = Math.min((now - start) / dur, 1);
      var e = 1 - Math.pow(1 - t, 3);
      el.textContent = format(target * e, dec, comma) + suffix;
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  /* ── 4. Radar blips ↔ opportunity cards ───────────────────── */
  function linkRadar() {
    var blips = document.querySelectorAll('.blip');
    var ops   = document.querySelectorAll('.op');
    if (!blips.length) return;

    function set(id, on) {
      document.querySelectorAll('[data-op="' + id + '"]').forEach(function (n) {
        n.classList.toggle('is-hot', on);
      });
    }

    function wire(node) {
      var id = node.dataset.op;
      ['mouseenter', 'focus'].forEach(function (ev) {
        node.addEventListener(ev, function () { set(id, true); });
      });
      ['mouseleave', 'blur'].forEach(function (ev) {
        node.addEventListener(ev, function () { set(id, false); });
      });
    }

    blips.forEach(function (b) {
      wire(b);
      b.setAttribute('tabindex', '0');
      b.addEventListener('click', function () {
        var card = document.querySelector('.op[data-op="' + b.dataset.op + '"]');
        if (card) card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      });
    });
    ops.forEach(wire);
  }

  /* ── 5. Scroll reveal helper ──────────────────────────────── */
  function onceVisible(el, fn) {
    if (!el) return;
    if (!('IntersectionObserver' in window)) { fn(el); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) { fn(entry.target); io.unobserve(entry.target); }
      });
    }, { threshold: 0.25 });
    io.observe(el);
  }

  function setupReveals() {
    var targets = document.querySelectorAll('.card, .op, .dial-wrap, .panel__head, .demobar');
    targets.forEach(function (el, i) {
      if (reduced) return;
      el.classList.add('reveal');
      el.style.transitionDelay = ((i % 4) * 60) + 'ms';
      onceVisible(el, function (t) {
        t.classList.add('is-in');
        window.setTimeout(function () {
          t.classList.remove('reveal', 'is-in');
          t.style.transitionDelay = '';
        }, 1000);
      });
    });

    document.querySelectorAll('[data-count]').forEach(function (el) {
      onceVisible(el.closest('.card, .strip__item, .score, .metrics') || el, function () {
        runCounter(el);
      });
    });
  }

  /* ── go ───────────────────────────────────────────────────── */
  function init() {
    buildChart();
    buildScore();
    linkRadar();
    setupReveals();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
