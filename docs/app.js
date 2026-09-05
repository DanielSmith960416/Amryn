/* Amryn™ AIGrowthIntelligence® — Executive Command Centre
   Views render from WORKSPACES, so switching workspace or period
   recomputes everything rather than swapping static markup. */
(function () {
  'use strict';

  /* ══ Platform link ══════════════════════════════════════════
     Where the Amryn software is deployed. Set this once, and every
     [data-app-link] on the page is revealed and pointed at it.
     Left empty, those links stay hidden — a marketing site with a
     "Sign in" button that 404s is worse than one without.

     The application is a Node server on Railway behind Cloudflare;
     this site is the static half. Two hostnames on purpose: this
     page must load fast for a stranger and be indexable, and the
     application must never be either.

     It was briefly set to app.amryn.ai, which is not registered — so
     every Sign in button on a live page led to a DNS failure, which
     is precisely the thing the paragraph above says not to do.

     Now the Railway service answers, so this is its generated
     hostname. Verified before setting it: /api/health/live returns
     200 and the sign-in page renders its form rather than an
     unconfigured notice. When amryn.ai is registered and pointed at
     the same service, change this line to the custom domain — one
     value, one place.                                           */
  // The application is served from the same domain as this site: Cloudflare
  // sends /app/* to Railway and lets everything else reach GitHub Pages. See
  // cloudflare/README.md.
  var APP_URL = 'https://www.amryn.ai/app';

  (function wireAppLinks() {
    var links = document.querySelectorAll('[data-app-link]');
    if (!APP_URL) return;
    var base = APP_URL.replace(/\/+$/, '');
    for (var i = 0; i < links.length; i++) {
      links[i].href = base + links[i].getAttribute('data-app-link');
      links[i].hidden = false;
    }
  })();

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var MONTHS = ['Sep','Oct','Nov','Dec','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug'];

  /* ══ Data ══════════════════════════════════════════════════
     Three workspaces at deliberately different scales — the
     same intelligence loop applies to all of them.          */
  var WORKSPACES = {
    highveld: {
      name: 'Highveld Supply Co.',
      scale: 'Single site · 14 staff',
      sector: 'Wholesale distribution, Gauteng',
      week: 'Week 34, 2026',
      score: 78, scoreDelta: '▲ 4 points since last week',
      revenue: [840, 812, 878, 905, 890, 962, 1010, 985, 1064, 1120, 1178, 1240],
      unit: 'R', suffix: 'k',
      bars: [['Cash position',82],['Demand',76],['Retention',71],['Delivery',84]],
      metrics: [
        ['Active customers', '342', '▲ 18 this month', 'up'],
        ['Monthly revenue', 'R1.24m', '▲ 9.2% YoY', 'up'],
        ['Customer churn', '3.1%', '▼ 0.6pt improved', 'up'],
        ['Avg. order value', 'R3,620', '— unchanged', 'flat']
      ],
      feed: [
        ['MON','Two dormant accounts reordered','after the June win-back mails. Combined value R74,800.'],
        ['WED','Delivery window slipped to 4.1 days','on Pretoria routes. Third week climbing — worth a look before it reaches customers’ notice.'],
        ['THU','Bulk pricing tier is doing the work.','31% of orders now clear the 20-unit threshold, up from 19% in May.'],
        ['FRI','One top-ten account went quiet.','Meridian Foods has not ordered in 41 days against a 24-day norm.']
      ],
      risks: [
        'Delivery window slipped for a third week running.',
        'Meridian Foods silent 41 days against a 24-day norm.'
      ],
      ops: [
        {id:1, kind:'opportunity', when:'Closes in 3 weeks', worth:'R 480k', urgency:.30, size:11,
         title:'Municipal catering tender reopens',
         body:'Ekurhuleni reissued its 24-month supply tender after the first round failed on compliance. Only two of the original six bidders have re-registered.',
         why:'you already hold the SABS certification the last round tripped on.'},
        {id:2, kind:'opportunity', when:'Closes in 3 months', worth:'R 210k', urgency:.62, size:9,
         title:'Nobody serves the East Rand on Saturdays',
         body:'Search demand for weekend wholesale delivery in your categories is up 34% since March, and no competitor within 40km advertises Saturday dispatch.',
         why:'your Saturday fleet already runs at 40% capacity.'},
        {id:3, kind:'opportunity', when:'Closes in 6 weeks', worth:'R 155k', urgency:.46, size:7,
         title:'Two suppliers dropped their minimum order',
         body:'Your two largest input suppliers cut minimum order quantities this month to move stock. Buying forward at the current rate protects margin into Q1.',
         why:'cash position scores 82; you can carry the stock.'},
        {id:4, kind:'threat', when:'21 Aug', worth:'', urgency:.52, size:6,
         title:'Kruger Wholesale cut list prices 6%',
         body:'Across dry goods. Their delivery fee went up R120 in the same week, so the headline is softer than it looks.', why:''},
        {id:5, kind:'threat', when:'20 Aug', worth:'', urgency:.76, size:5,
         title:'Nkosi Trading opened a Benoni depot',
         body:'That puts them inside your Ekurhuleni delivery ring for the first time.', why:''},
        {id:6, kind:'threat', when:'18 Aug', worth:'', urgency:.88, size:5,
         title:'Vaal Distributors is hiring three sales reps',
         body:'For Gauteng North — a build-out, not a hold.', why:''}
      ],
      acts: [
        ['Register for the Ekurhuleni tender','Compliance pack is already on file from the March bid.','Daniel','About 2 hours','Unlocks R 480k'],
        ['Call Meridian Foods before Wednesday','41 days quiet against a 24-day norm, and Nkosi just opened a depot 9km from them. Ask about the account, not the order.','Sales','20 minutes','Protects R 96k a year'],
        ['Fix the Pretoria delivery slip','Three weeks of climbing lead times, while your nearest competitor is losing reviews over exactly this.','Ops','This week','Defends 3.1% churn']
      ]
    },

    meridian: {
      name: 'Meridian Retail Group',
      scale: 'Multi-branch · 9 sites · 210 staff',
      sector: 'Retail group, Gauteng & Free State',
      week: 'Week 34, 2026',
      score: 64, scoreDelta: '▼ 3 points since last week',
      revenue: [4120, 4260, 4180, 4640, 4390, 4510, 4470, 4720, 4680, 4590, 4810, 4760],
      unit: 'R', suffix: 'k',
      bars: [['Cash position',58],['Demand',71],['Retention',66],['Delivery',61]],
      metrics: [
        ['Sites trading', '9', '▲ 1 opened in July', 'up'],
        ['Group revenue', 'R4.76m', '▼ 1.0% on last month', 'down'],
        ['Basket size', 'R412', '▲ 2.4% YoY', 'up'],
        ['Stock cover', '38 days', '▲ 6 days — overweight', 'down']
      ],
      feed: [
        ['MON','Vereeniging is carrying the group.','One site is up 14% while four are flat or down. Group averages are hiding it.'],
        ['TUE','Stock cover reached 38 days.','Six days above target, concentrated in two slow categories at three sites.'],
        ['THU','Weekend staffing is under-set at four sites.','Saturday conversion is 11 points below weekday at exactly those sites.'],
        ['FRI','The new Bloemfontein site cleared break-even','in month three, against a plan of month five.']
      ],
      risks: [
        'Four of nine sites flat or declining; group average masks it.',
        'Stock cover six days over target and climbing.'
      ],
      ops: [
        {id:1, kind:'opportunity', when:'Closes in 5 weeks', worth:'R 1.2m', urgency:.34, size:12,
         title:'Anchor tenancy open in Sasolburg centre',
         body:'The centre lost its anchor grocer in July and is discounting a 10-year lease to refill it. Your Vereeniging catchment already overlaps 40% of the trade area.',
         why:'Vereeniging is your strongest site and it is running at capacity.'},
        {id:2, kind:'opportunity', when:'Ongoing', worth:'R 640k', urgency:.58, size:10,
         title:'Weekend conversion gap is worth more than a new site',
         body:'Saturday conversion runs 11 points below weekday at four sites. Matching the group’s best-performing weekend roster would recover more margin than the Bloemfontein build did.',
         why:'the fix is rostering, not capital.'},
        {id:3, kind:'opportunity', when:'Closes in 2 weeks', worth:'R 305k', urgency:.22, size:8,
         title:'Supplier clearing seasonal stock at 34% off',
         body:'Two categories you are already overweight in — but a third, where you are short, is in the same clearance.',
         why:'buy the short category only; cash position scores 58.'},
        {id:4, kind:'threat', when:'22 Aug', worth:'', urgency:.70, size:6,
         title:'Competitor opened extended hours in Vanderbijlpark',
         body:'Trading to 20:00 seven days. Your site there closes at 18:00.', why:''},
        {id:5, kind:'threat', when:'19 Aug', worth:'', urgency:.84, size:6,
         title:'Two store managers resigned in the same region',
         body:'Both to the same competitor group. Third resignation in that region this quarter.', why:''},
        {id:6, kind:'threat', when:'17 Aug', worth:'', urgency:.55, size:5,
         title:'Landlord signalled a 9% escalation at three sites',
         body:'Renewals fall due within four months of each other.', why:''}
      ],
      acts: [
        ['Get the Sasolburg lease terms in writing','The centre is discounting to refill the anchor slot and your strongest site is 20km away and full.','Daniel','This week','Unlocks R 1.2m'],
        ['Copy the Vereeniging weekend roster to four sites','An 11-point conversion gap that costs nothing but rostering to close.','Regional Ops','Two weeks','Recovers R 640k'],
        ['Hold an exit conversation in the affected region','Third resignation this quarter, all to the same competitor. Find out what they are offering.','People','Before Friday','Protects 9 sites']
      ]
    },

    kalahari: {
      name: 'Kalahari Freight & Logistics',
      scale: 'National · 4 depots · 480 staff',
      sector: 'Freight and contract logistics, national',
      week: 'Week 34, 2026',
      score: 71, scoreDelta: '▲ 2 points since last week',
      revenue: [18200, 17900, 18600, 19100, 18400, 19700, 20300, 19900, 21100, 20600, 21800, 22400],
      unit: 'R', suffix: 'k',
      bars: [['Cash position',74],['Demand',80],['Retention',63],['Delivery',68]],
      metrics: [
        ['Contracts live', '61', '▲ 4 this quarter', 'up'],
        ['Monthly revenue', 'R22.4m', '▲ 12.3% YoY', 'up'],
        ['Contract renewal', '81%', '▼ 5pt on last year', 'down'],
        ['Empty running', '18.2%', '▼ 1.4pt improved', 'up']
      ],
      feed: [
        ['MON','Empty running fell below 19% for the first time.','The backhaul matching change in June is holding.'],
        ['TUE','Three contracts renew inside 90 days','worth R 4.1m combined. None has been re-quoted yet.'],
        ['WED','Durban depot missed SLA on 6% of loads.','Double the group rate, concentrated on one customer.'],
        ['FRI','Fuel hedge rolls off in November.','At current rates that is R 380k a month unhedged.']
      ],
      risks: [
        'R 4.1m of contracts renew within 90 days, none re-quoted.',
        'Durban SLA misses running at double the group rate.'
      ],
      ops: [
        {id:1, kind:'opportunity', when:'Closes in 8 weeks', worth:'R 6.8m', urgency:.28, size:13,
         title:'Retail group tendering national distribution',
         body:'A nine-site retail group is moving from three regional carriers to a single national contract. Your depot footprint already covers all nine.',
         why:'you are one of two carriers with depots in every region they trade.'},
        {id:2, kind:'opportunity', when:'Closes in 90 days', worth:'R 4.1m', urgency:.66, size:11,
         title:'Three renewals are being left too late',
         body:'Three contracts worth R 4.1m renew inside 90 days and none has been re-quoted. Renewal rate has already dropped five points year on year.',
         why:'every renewal quoted early last year was retained.'},
        {id:3, kind:'opportunity', when:'Closes in 6 weeks', worth:'R 920k', urgency:.44, size:9,
         title:'Backhaul lane open on the N3 corridor',
         body:'A manufacturer is publicly seeking return-leg capacity on a lane your trucks already run empty three days a week.',
         why:'empty running on that lane is 31%, well above your 18.2% average.'},
        {id:4, kind:'threat', when:'23 Aug', worth:'', urgency:.72, size:6,
         title:'Competitor took delivery of 40 new units',
         body:'A capacity build-out on the corridors where you compete directly.', why:''},
        {id:5, kind:'threat', when:'20 Aug', worth:'', urgency:.90, size:6,
         title:'Fuel hedge rolls off in November',
         body:'At current rates that is roughly R 380k a month unhedged.', why:''},
        {id:6, kind:'threat', when:'16 Aug', worth:'', urgency:.60, size:5,
         title:'New weighbridge enforcement on the N3',
         body:'Adds an estimated 40 minutes per load on your highest-volume lane.', why:''}
      ],
      acts: [
        ['Re-quote the three contracts due inside 90 days','R 4.1m renewing with nothing quoted, and renewal rate already down five points.','Daniel','This week','Protects R 4.1m'],
        ['Register for the national distribution tender','Your depot footprint covers all nine of their sites; only one other carrier can say that.','Sales','Two days','Unlocks R 6.8m'],
        ['Root-cause the Durban SLA misses','Double the group rate and concentrated on one customer — that is a churn signal, not a depot problem.','Ops','Before month end','Defends 81% renewal']
      ]
    }
  };

  var LOOP = [
    ['Observe','Collect and monitor relevant internal and external signals.'],
    ['Understand','Explain what is happening and why.'],
    ['Predict','Identify likely future outcomes and emerging risks.'],
    ['Discover','Find relevant opportunities and growth signals.'],
    ['Recommend','Propose prioritised actions with rationale.'],
    ['Act','Assign and execute decisions.'],
    ['Measure','Track outcomes and ROI.'],
    ['Learn','Use outcomes to improve recommendations.']
  ];

  /* ══ State ═════════════════════════════════════════════════ */
  var wsKey = 'highveld', months = 12, done = {};

  function storeKey() { return 'amryn.acts.' + wsKey; }
  function loadDone() {
    try { done = JSON.parse(localStorage.getItem(storeKey())) || {}; }
    catch { done = {}; }
  }
  function saveDone() {
    try { localStorage.setItem(storeKey(), JSON.stringify(done)); } catch {}
  }

  function ws() { return WORKSPACES[wsKey]; }
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  /* ══ Chart ═════════════════════════════════════════════════ */
  function buildChart() {
    var line = $('#chartLine'), area = $('#chartArea'), pin = $('#chartPin');
    if (!line) return;

    var all = ws().revenue;
    var data = all.slice(all.length - months);
    var labels = MONTHS.slice(MONTHS.length - months);

    var W = 640, H = 260, padY = 26, padX = 7;
    var min = Math.min.apply(null, data) * 0.94;
    var max = Math.max.apply(null, data) * 1.02;
    var span = (max - min) || 1;

    var pts = data.map(function (v, i) {
      var x = padX + (data.length === 1 ? .5 : i / (data.length - 1)) * (W - padX * 2);
      var y = H - padY - ((v - min) / span) * (H - padY * 2);
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

    var xs = $('#chartX');
    xs.innerHTML = '';
    // thin the labels on the long window, but always keep the latest month
    labels.forEach(function (m, i) {
      if (months > 6 && i % 2 === 0) return;
      xs.appendChild(el('span', null, m));
    });

    var first = data[0], latest = data[data.length - 1];
    var pc = ((latest - first) / first) * 100;
    $('#chartRange').textContent = months === 12 ? 'Rolling 12 months'
                                : months === 6  ? 'Last 6 months' : 'Last quarter';
    $('#chartNote').innerHTML = 'Latest month <b>R' + (latest / 1000).toFixed(2) + 'm</b>. Across this window revenue moved <b>' +
      (pc >= 0 ? '+' : '') + pc.toFixed(1) + '%</b>.';

    if (reduced) { $('#chart').classList.add('is-drawn'); return; }
    var len = line.getTotalLength();
    line.style.transition = 'none';
    line.style.strokeDasharray = len;
    line.style.strokeDashoffset = len;
    // force reflow so the transition restarts on every rebuild
    void line.getBoundingClientRect();
    line.style.transition = 'stroke-dashoffset 1.4s cubic-bezier(.16,1,.3,1)';
    line.style.strokeDashoffset = 0;
    $('#chart').classList.add('is-drawn');
  }

  /* ══ Score ═════════════════════════════════════════════════ */
  function buildScore() {
    var fill = $('.score__fill');
    if (!fill) return;
    var r = +fill.getAttribute('r'), circ = 2 * Math.PI * r;
    var pct = ws().score / 100;
    fill.style.transition = reduced ? 'none' : 'stroke-dasharray 1.1s cubic-bezier(.16,1,.3,1)';
    fill.style.strokeDasharray = (circ * pct) + ' ' + circ;
    countTo($('#scoreNum'), ws().score);
    $('#scoreDelta').textContent = ws().scoreDelta;
    $('#scoreDelta').className = 'delta' + (/▼/.test(ws().scoreDelta) ? ' delta--down' : '');
  }

  function countTo(node, target) {
    if (!node) return;
    if (reduced) { node.textContent = target; return; }
    var start = performance.now(), dur = 900;
    (function step(now) {
      var t = Math.min((now - start) / dur, 1);
      var e = 1 - Math.pow(1 - t, 3);
      node.textContent = Math.round(target * e);
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  /* ══ Digital Twin ══════════════════════════════════════════ */
  function buildTwin() {
    var w = ws();

    var m = $('#twinMetrics'); m.innerHTML = '';
    w.metrics.forEach(function (row) {
      var li = el('li');
      li.appendChild(el('span', 'metrics__k', esc(row[0])));
      li.appendChild(el('span', 'metrics__v', esc(row[1])));
      li.appendChild(el('span', 'delta' + (row[3] === 'down' ? ' delta--down' : row[3] === 'flat' ? ' delta--flat' : ''), esc(row[2])));
      m.appendChild(li);
    });

    var f = $('#twinFeed'); f.innerHTML = '';
    w.feed.forEach(function (row) {
      var li = el('li');
      li.appendChild(el('span', 'feed__d', esc(row[0])));
      li.appendChild(el('p', null, '<b>' + esc(row[1]) + '</b> ' + esc(row[2])));
      f.appendChild(li);
    });

    var b = $('#twinBars'); b.innerHTML = '';
    w.bars.forEach(function (row) {
      var li = el('li');
      li.appendChild(el('span', 'bars__k', esc(row[0])));
      var track = el('i', 'bars__t');
      var fillEl = el('i', 'bars__f');
      fillEl.style.width = row[1] + '%';
      track.appendChild(fillEl);
      li.appendChild(track);
      li.appendChild(el('b', null, row[1]));
      b.appendChild(li);
    });

    $('#twinWeek').textContent = w.week;
  }

  /* ══ Opportunity Radar ═════════════════════════════════════ */
  function buildRadar() {
    var w = ws();
    var filter = $('#oppFilter').value;
    var list = w.ops.filter(function (o) { return filter === 'all' || o.kind === filter; });

    /* blips — angle is stable per id so the layout does not jump */
    var g = $('#dialBlips'); g.innerHTML = '';
    list.forEach(function (o) {
      var ang = (o.id * 47) % 360 * Math.PI / 180;
      var rad = 22 + o.urgency * 112;
      var c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('cx', (150 + Math.cos(ang) * rad).toFixed(1));
      c.setAttribute('cy', (150 + Math.sin(ang) * rad).toFixed(1));
      c.setAttribute('r', o.size);
      c.setAttribute('class', 'blip' + (o.kind === 'threat' ? ' blip--threat' : ''));
      c.setAttribute('data-op', o.id);
      c.setAttribute('tabindex', '0');
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', o.title);
      g.appendChild(c);
    });

    var box = $('#ops'); box.innerHTML = '';
    if (!list.length) {
      box.appendChild(el('p', 'empty', 'No signals of this type in the current window.'));
    }
    list.forEach(function (o) {
      var card = el('article', 'op op--' + o.kind);
      card.setAttribute('data-op', o.id);
      card.setAttribute('tabindex', '0');
      var top = el('div', 'op__top');
      top.appendChild(el('span', 'op__when', esc(o.when)));
      if (o.worth) top.appendChild(el('span', 'op__worth', esc(o.worth)));
      card.appendChild(top);
      card.appendChild(el('h3', 'op__h3', esc(o.title)));
      card.appendChild(el('p', 'op__body', esc(o.body)));
      if (o.why) card.appendChild(el('p', 'op__why', '<b>Why you</b> — ' + esc(o.why)));
      box.appendChild(card);
    });

    linkRadar();
  }

  function linkRadar() {
    function set(id, on) {
      $$('[data-op="' + id + '"]').forEach(function (n) { n.classList.toggle('is-hot', on); });
    }
    function wire(node) {
      var id = node.getAttribute('data-op');
      ['mouseenter','focus'].forEach(function (e) { node.addEventListener(e, function () { set(id, true); }); });
      ['mouseleave','blur'].forEach(function (e) { node.addEventListener(e, function () { set(id, false); }); });
    }
    $$('.blip').forEach(function (b) {
      wire(b);
      function go() {
        var card = $('.op[data-op="' + b.getAttribute('data-op') + '"]');
        if (card) {
          card.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
          card.classList.add('is-hot');
          setTimeout(function () { card.classList.remove('is-hot'); }, 1400);
        }
      }
      b.addEventListener('click', go);
      b.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
      });
    });
    $$('.op').forEach(wire);
  }

  /* ══ Actions ═══════════════════════════════════════════════ */
  function buildActions() {
    var w = ws(), box = $('#acts');
    box.innerHTML = '';
    w.acts.forEach(function (a, i) {
      var id = 'act-' + wsKey + '-' + i;
      var li = el('li', 'act' + (done[i] ? ' is-done' : ''));

      var cb = el('input');
      cb.type = 'checkbox'; cb.id = id; cb.checked = !!done[i];
      cb.addEventListener('change', function () {
        done[i] = cb.checked;
        li.classList.toggle('is-done', cb.checked);
        saveDone();
        tallyActions();
      });

      var lab = el('label', 'act__body');
      lab.setAttribute('for', id);
      lab.appendChild(el('span', 'act__n', String(i + 1)));
      var inner = el('div');
      inner.appendChild(el('h3', 'act__h3', esc(a[0])));
      inner.appendChild(el('p', 'act__p', esc(a[1])));
      var meta = el('p', 'act__meta');
      meta.appendChild(el('span', null, 'Owner: ' + esc(a[2])));
      meta.appendChild(el('span', null, esc(a[3])));
      meta.appendChild(el('span', 'act__win', esc(a[4])));
      inner.appendChild(meta);
      lab.appendChild(inner);

      li.appendChild(cb);
      li.appendChild(lab);
      box.appendChild(li);
    });
    tallyActions();
  }

  function tallyActions() {
    var total = ws().acts.length;
    var n = 0;
    for (var k in done) if (done[k]) n++;
    n = Math.min(n, total);
    $('#doneCount').textContent = n;
    $('#totalCount').textContent = total;
    $('#progBar').style.width = (total ? (n / total) * 100 : 0) + '%';
    $('#railCount').textContent = (total - n);
    $('#railCount').classList.toggle('is-clear', total - n === 0);
  }

  /* ══ Command Centre summary ════════════════════════════════ */
  function buildCommand() {
    var w = ws();
    $('#ccSub').textContent = w.name + ' — ' + w.sector + ' · ' + w.scale;
    $('#ccStamp').textContent = w.week;

    var a = $('#ccActions'); a.innerHTML = '';
    w.acts.forEach(function (row, i) {
      var li = el('li', done[i] ? 'is-done' : null);
      li.appendChild(el('b', null, esc(row[0])));
      li.appendChild(el('span', null, esc(row[2]) + ' · ' + esc(row[3])));
      a.appendChild(li);
    });

    var top = w.ops.filter(function (o) { return o.kind === 'opportunity'; })[0];
    $('#ccOpp').innerHTML = top
      ? '<p class="cc__worth">' + esc(top.worth) + '</p>' +
        '<h3 class="cc__h3">' + esc(top.title) + '</h3>' +
        '<p class="cc__when">' + esc(top.when) + '</p>'
      : '';

    var r = $('#ccRisks'); r.innerHTML = '';
    w.risks.forEach(function (t) { r.appendChild(el('li', null, esc(t))); });
  }

  /* ══ Intelligence Loop ═════════════════════════════════════ */
  function buildLoop() {
    var box = $('#loop');
    if (box.children.length) return;
    LOOP.forEach(function (row, i) {
      var li = el('li', 'loop__s');
      li.appendChild(el('span', 'loop__n', String(i + 1).padStart(2, '0')));
      li.appendChild(el('h3', null, esc(row[0])));
      li.appendChild(el('p', null, esc(row[1])));
      box.appendChild(li);
    });
  }

  /* ══ View switching ════════════════════════════════════════ */
  function show(view) {
    $$('.view').forEach(function (v) {
      var on = v.getAttribute('data-view') === view;
      v.hidden = !on;
      v.classList.toggle('is-on', on);
    });
    $$('.rail__b').forEach(function (b) {
      var on = b.getAttribute('data-view') === view;
      b.classList.toggle('is-on', on);
      if (on) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    if (view === 'twin') { buildChart(); }
    if (view === 'loop') { buildLoop(); }
    var v = $('.view[data-view="' + view + '"]');
    if (v) v.focus({ preventScroll: true });
  }

  /* ══ Render everything for the current workspace ═══════════ */
  function renderAll() {
    loadDone();
    buildScore();
    buildTwin();
    buildRadar();
    buildActions();
    buildCommand();
    $('#railScale').textContent = ws().scale;
    if (!$('.view[data-view="twin"]').hidden) buildChart();
    stamp();
  }

  function stamp() {
    var d = new Date();
    var hh = String(d.getHours()).padStart(2, '0');
    var mm = String(d.getMinutes()).padStart(2, '0');
    $('#synced').textContent = 'Synced ' + hh + ':' + mm;
  }

  /* ══ Boot ══════════════════════════════════════════════════ */
  function init() {
    var sel = $('#workspace');
    Object.keys(WORKSPACES).forEach(function (k) {
      var o = el('option', null, esc(WORKSPACES[k].name));
      o.value = k;
      sel.appendChild(o);
    });
    sel.value = wsKey;

    sel.addEventListener('change', function () { wsKey = sel.value; renderAll(); });
    $('#period').addEventListener('change', function () {
      months = +$('#period').value;
      buildChart();
    });
    $('#oppFilter').addEventListener('change', buildRadar);
    $('#resetActs').addEventListener('click', function () {
      done = {}; saveDone(); buildActions(); buildCommand();
    });

    $$('.rail__b').forEach(function (b) {
      b.addEventListener('click', function () { show(b.getAttribute('data-view')); });
    });
    $$('[data-goto]').forEach(function (b) {
      b.addEventListener('click', function () { show(b.getAttribute('data-goto')); });
    });

    renderAll();
    buildLoop();
    show('command');
    setInterval(stamp, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
