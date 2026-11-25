(function () {
  const { CATEGORIES, parseAll, categorize } = window.SpendParser;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const store = {
    get(k, d) { try { const v = localStorage.getItem('ss_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem('ss_' + k, JSON.stringify(v)); return true; } catch { return false; } },
    del(k) { try { localStorage.removeItem('ss_' + k); } catch {} },
  };

  const S = {
    raw: store.get('raw', null),   // money-related messages from the last import ({address, body, date})
    months: store.get('months', 6),
    txns: store.get('txns', []),
    scannedAt: store.get('scannedAt', 0),
    demo: store.get('demo', false),
    overrides: store.get('overrides', {}),
    sel: 'all',          // 'all' | 'YYYY-MM'
    tab: 'overview',
    actCat: 'all',
    q: '',
  };

  // ───────── formatting ─────────
  const inr = (n) => '₹' + Math.round(n).toLocaleString('en-IN');
  const compact = (n) => n >= 1e7 ? '₹' + (n / 1e7).toFixed(2) + 'Cr' : n >= 1e5 ? '₹' + (n / 1e5).toFixed(n >= 1e6 ? 1 : 2) + 'L' : n >= 1e3 ? '₹' + (n / 1e3).toFixed(1) + 'K' : '₹' + Math.round(n);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mkey = (t) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const mlabel = (k, long) => { const [y, m] = k.split('-'); return MONTHS[+m - 1] + (long ? ' ' + y : " '" + y.slice(2)); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const cat = (k) => CATEGORIES[k] || { name: 'Income', color: '#5ee0a0', icon: '↙' };
  const sinceDate = (m) => { const d = new Date(); d.setMonth(d.getMonth() - m); d.setHours(0, 0, 0, 0); return d; };

  function toast(msg, ms = 2600) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('on');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms);
  }

  function countUp(el, to, fmt = inr, dur = 900) {
    const from = el._v || 0; el._v = to;
    const t0 = performance.now();
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt(from + (to - from) * e);
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function show(id) {
    ['#onboard', '#scan', '#app'].forEach((s) => ($(s).hidden = s !== id));
    window.scrollTo(0, 0);
  }

  // ───────── month picker (shared by onboarding + rescan sheet) ─────────
  function monthPicker(root, onChange) {
    const chips = root.querySelector('.chips'), range = root.querySelector('input[type=range]'), out = root.querySelector('.mp-val'), since = root.querySelector('.mp-since');
    const presets = [1, 3, 6, 12];
    chips.innerHTML = presets.map((n) => `<button class="chip" data-m="${n}">${n === 12 ? '1 year' : n + ' mo'}</button>`).join('');
    chips.classList.add('grid4');
    const set = (n) => {
      S.months = n; range.value = n; out.textContent = n;
      range.style.setProperty('--p', ((n - 1) / 23) * 100 + '%');
      chips.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', +c.dataset.m === n));
      since.textContent = 'Messages since ' + sinceDate(n).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
      onChange && onChange(n);
    };
    chips.onclick = (e) => { const b = e.target.closest('.chip'); if (b) set(+b.dataset.m); };
    range.oninput = () => set(+range.value);
    set(S.months);
  }

  // ───────── scanning ─────────
  // Browsers cannot read SMS, so messages come from an exported backup file.
  const MONEY = /(?:rs\.?|inr|₹)\s*:?\s*\d/i;
  const decode = (s) => s.replace(/&#(x?)([0-9a-f]+);/gi, (m, x, n) => String.fromCodePoint(parseInt(n, x ? 16 : 10)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

  function parseBackup(text) {
    const t = text.replace(/^﻿/, '').trimStart();
    let list = [];
    if (t[0] === '<') {
      // "SMS Backup & Restore" XML: <sms address=".." date="ms" type="1" body=".." />. Scanned with a regex
      // so huge backups (with MMS attachments) don't have to be built into a DOM.
      const re = /<sms\s([^>]*?)\/?>/g, attr = /([\w_]+)="([^"]*)"/g;
      let m;
      while ((m = re.exec(t))) {
        const a = {}; let x;
        attr.lastIndex = 0;
        while ((x = attr.exec(m[1]))) a[x[1]] = x[2];
        if (a.type && a.type !== '1') continue;        // inbox only
        list.push({ address: decode(a.address || ''), body: decode(a.body || ''), date: +a.date });
      }
    } else if (t[0] === '[' || t[0] === '{') {
      let j = JSON.parse(t);
      if (!Array.isArray(j)) j = j.messages || j.sms || j.data || [];
      list = j.map((m) => ({
        address: m.address || m.from || m.sender || '',
        body: m.body || m.text || m.message || '',
        date: typeof m.date === 'number' ? m.date : (+m.date || Date.parse(m.date || m.timestamp) || +m.timestamp || 0),
      }));
    } else {
      throw new Error('Unsupported file — use the .xml from “SMS Backup & Restore” or a JSON export.');
    }
    const money = list.filter((m) => m.body && m.date > 0 && MONEY.test(m.body));
    if (!list.length) throw new Error('No SMS found in that file.');
    return money.map((m, i) => ({ id: i, ...m }));
  }

  function importFile(file) {
    if (!file) return;
    const r = new FileReader();
    r.onerror = () => toast('Could not read that file');
    r.onload = () => {
      try {
        const raw = parseBackup(String(r.result));
        S.raw = raw; S.demo = false;
        const ok = store.set('raw', raw);
        if (!ok) toast('Backup is large — the period can only be changed by importing again', 4000);
        scan(S.months);
      } catch (e) { toast(e.message || String(e), 5000); }
    };
    r.readAsText(file);
  }

  function pickFile() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.xml,.json,text/xml,application/json';
    inp.onchange = () => importFile(inp.files[0]);
    inp.click();
  }

  async function readSms(months) {
    const since = sinceDate(months).getTime();
    if (S.demo || !S.raw) return { list: window.makeDemoSms(months), demo: true };
    return { list: S.raw.filter((m) => m.date >= since), demo: false };
  }

  async function scan(months) {
    show('#scan');
    const prog = $('#scanProg'), cnt = $('#scanCount');
    prog.style.strokeDashoffset = 327; cnt.textContent = '0';
    $('#scanTitle').textContent = 'Reading your messages…';
    $('#scanSub').textContent = `Looking back ${months} month${months > 1 ? 's' : ''}`;
    let fake = 0; const tick = setInterval(() => { fake = Math.min(0.7, fake + 0.04); prog.style.strokeDashoffset = 327 * (1 - fake); }, 80);
    try {
      const t0 = Date.now();
      const { list, demo } = await readSms(months);
      clearInterval(tick);
      $('#scanTitle').textContent = 'Finding transactions…';
      $('#scanSub').textContent = `${list.length.toLocaleString('en-IN')} bank & payment alerts found`;
      const txns = parseAll(list, S.overrides);
      // animate the counter up to the number of transactions found
      const total = txns.length, dur = 1100, ts = performance.now();
      await new Promise((res) => {
        const f = (t) => {
          const p = Math.min(1, (t - ts) / dur);
          cnt.textContent = Math.round(total * p);
          prog.style.strokeDashoffset = 327 * (1 - (0.7 + 0.3 * p));
          p < 1 ? requestAnimationFrame(f) : res();
        };
        requestAnimationFrame(f);
      });
      await new Promise((r) => setTimeout(r, Math.max(300, 1400 - (Date.now() - t0))));
      S.txns = txns; S.demo = demo; S.scannedAt = Date.now(); S.sel = 'all';
      store.set('txns', txns.map(({ body, ...t }) => ({ ...t, body: body.slice(0, 400) })));
      store.set('demo', demo); store.set('scannedAt', S.scannedAt); store.set('months', months);
      openApp();
      if (demo) toast('Showing demo data — import your SMS backup from Settings to see your own', 4200);
      else toast(`${total} transactions from ${months} month${months > 1 ? 's' : ''}`);
    } catch (e) {
      clearInterval(tick);
      show(S.txns.length ? '#app' : '#onboard');
      toast(e.message || String(e), 5000);
    }
  }

  // ───────── analytics ─────────
  function inSel(t) { return S.sel === 'all' || mkey(t.date) === S.sel; }

  function stats() {
    const all = S.txns;
    const tx = all.filter(inSel);
    const debits = tx.filter((t) => t.type === 'debit');
    const credits = tx.filter((t) => t.type === 'credit');
    const spent = debits.reduce((s, t) => s + t.amount, 0);
    const received = credits.reduce((s, t) => s + t.amount, 0);

    const byCat = {};
    debits.forEach((t) => (byCat[t.category] = (byCat[t.category] || 0) + t.amount));
    const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

    const byMerch = {};
    debits.forEach((t) => { const m = byMerch[t.merchant] || (byMerch[t.merchant] = { n: 0, amt: 0, cat: t.category }); m.n++; m.amt += t.amount; });
    const merchants = Object.entries(byMerch).filter(([k]) => k !== 'Unknown').sort((a, b) => b[1].amt - a[1].amt).slice(0, 5);

    // months across the whole scan, oldest → newest, including empty ones
    const monthsList = [];
    const d = sinceDate(S.months); d.setDate(1);
    const end = new Date();
    while (d <= end) { monthsList.push(mkey(d)); d.setMonth(d.getMonth() + 1); }
    const byMonth = Object.fromEntries(monthsList.map((k) => [k, 0]));
    all.forEach((t) => { if (t.type === 'debit') { const k = mkey(t.date); if (k in byMonth) byMonth[k] += t.amount; } });

    // days covered by the selection
    let days;
    if (S.sel === 'all') days = Math.max(1, (Date.now() - sinceDate(S.months)) / 864e5);
    else {
      const [y, m] = S.sel.split('-').map(Number);
      const first = new Date(y, m - 1, 1), last = new Date(y, m, 1);
      days = Math.max(1, (Math.min(Date.now(), last) - first) / 864e5);
    }

    const week = [0, 0, 0, 0, 0, 0, 0];
    debits.forEach((t) => (week[new Date(t.date).getDay()] += t.amount));

    const biggest = debits.reduce((b, t) => (!b || t.amount > b.amount ? t : b), null);
    return { tx, debits, credits, spent, received, cats, merchants, byMonth, monthsList, days, week, biggest };
  }

  // ───────── rendering ─────────
  function renderMonthStrip(st) {
    const keys = st.monthsList.slice().reverse();
    $('#monthStrip').innerHTML = `<button class="chip ${S.sel === 'all' ? 'on' : ''}" data-k="all">All · ${S.months}M</button>` +
      keys.map((k) => `<button class="chip ${S.sel === k ? 'on' : ''}" data-k="${k}">${mlabel(k, true)}</button>`).join('');
  }

  function renderHero(st) {
    $('#heroLabel').textContent = S.sel === 'all' ? `Spent in last ${S.months} month${S.months > 1 ? 's' : ''}` : `Spent in ${mlabel(S.sel, true)}`;
    countUp($('#heroAmt'), st.spent);
    countUp($('#heroIn'), st.received, compact);
    const net = st.received - st.spent;
    $('#heroNet').textContent = (net >= 0 ? '+' : '−') + compact(Math.abs(net));
    countUp($('#heroCnt'), st.debits.length, (n) => Math.round(n));

    // delta: selected (or current) month vs the month before it
    const keys = st.monthsList, k = S.sel === 'all' ? keys[keys.length - 1] : S.sel, i = keys.indexOf(k);
    const el = $('#heroDelta');
    if (i > 0 && st.byMonth[keys[i - 1]] > 0) {
      const ch = (st.byMonth[k] - st.byMonth[keys[i - 1]]) / st.byMonth[keys[i - 1]] * 100;
      el.className = 'delta ' + (ch > 0 ? 'up' : 'down');
      el.textContent = (ch > 0 ? '▲ ' : '▼ ') + Math.abs(ch).toFixed(0) + '% vs ' + mlabel(keys[i - 1]);
      el.hidden = false;
    } else el.hidden = true;

    // sparkline: cumulative spend for a month, or monthly totals for "all"
    let pts;
    if (S.sel === 'all') pts = keys.map((k) => st.byMonth[k]);
    else {
      const [y, m] = S.sel.split('-').map(Number), n = new Date(y, m, 0).getDate();
      const daily = Array(n).fill(0);
      st.debits.forEach((t) => (daily[new Date(t.date).getDate() - 1] += t.amount));
      let c = 0; pts = daily.map((v) => (c += v));
      const today = new Date(); if (today.getFullYear() === y && today.getMonth() === m - 1) pts = pts.slice(0, today.getDate());
    }
    if (pts.length < 2) pts = [0, ...pts, ...(pts.length ? [] : [0])];
    const max = Math.max(...pts, 1), W = 300, H = 66;
    const xy = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - (v / max) * (H - 8) - 2]);
    const line = xy.map((p, i) => {
      if (!i) return `M${p[0]},${p[1]}`;
      const q = xy[i - 1], cx = (q[0] + p[0]) / 2;
      return `C${cx},${q[1]} ${cx},${p[1]} ${p[0]},${p[1]}`;
    }).join(' ');
    const last = xy[xy.length - 1];
    $('#spark').innerHTML = `<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
      <path d="${line} L${W},${H} L0,${H} Z" fill="url(#sg)"/>
      <path d="${line}" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" vector-effect="non-scaling-stroke" style="stroke-dasharray:1000;stroke-dashoffset:1000;animation:draw 1.4s ease forwards"/>
      <circle cx="${last[0]}" cy="${last[1]}" r="4.5" fill="#fff" style="filter:drop-shadow(0 0 6px #fff)"/>`;
  }

  function renderKpis(st) {
    const nMonths = S.sel === 'all' ? Math.max(1, st.days / 30.44) : 1;
    countUp($('#kAvg'), st.spent / nMonths, compact);
    countUp($('#kDay'), st.spent / st.days, compact);
    if (st.biggest) { countUp($('#kMax'), st.biggest.amount, compact); $('#kMaxM').textContent = st.biggest.merchant; }
    else { $('#kMax').textContent = '–'; $('#kMaxM').textContent = ''; }
    if (st.cats.length) {
      const [k, v] = st.cats[0];
      $('#kTop').textContent = cat(k).icon + ' ' + cat(k).name;
      $('#kTopP').textContent = Math.round((v / st.spent) * 100) + '% of spending';
    } else { $('#kTop').textContent = '–'; $('#kTopP').textContent = ''; }
  }

  function renderDonut(st) {
    const C = 2 * Math.PI * 80, gap = st.cats.length > 1 ? 3 : 0;
    let off = 0;
    const segs = st.cats.map(([k, v]) => {
      const len = Math.max(0, (v / st.spent) * C - gap);
      const s = `<circle cx="100" cy="100" r="80" stroke="${cat(k).color}" stroke-dasharray="0 ${C}" data-d="${len} ${C - len}" stroke-dashoffset="${-off}" data-k="${k}"/>`;
      off += (v / st.spent) * C;
      return s;
    }).join('');
    $('#donut').innerHTML = `<circle cx="100" cy="100" r="80" stroke="rgba(255,255,255,.05)"/>` + segs;
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#donut circle[data-d]').forEach((c) => c.setAttribute('stroke-dasharray', c.dataset.d))));
    $('#donutLbl').textContent = 'Spent';
    countUp($('#donutV'), st.spent, compact);
    $('#catCount').textContent = st.cats.length + ' categories';

    $('#catList').innerHTML = st.cats.map(([k, v]) => {
      const c = cat(k), n = st.debits.filter((t) => t.category === k).length;
      return `<button class="cat-row" data-cat="${k}" style="--c:${c.color}">
        <div class="cat-ic">${c.icon}</div>
        <div><div class="cat-name"><span>${c.name}</span></div><div class="cat-bar"><i data-w="${(v / st.cats[0][1]) * 100}"></i></div></div>
        <div class="cat-amt">${inr(v)}<small>${Math.round((v / st.spent) * 100)}% · ${n} txn</small></div>
      </button>`;
    }).join('') || '<div class="empty">No spending in this period</div>';
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#catList i').forEach((i) => (i.style.width = i.dataset.w + '%'))));
  }

  function renderBars(st) {
    const keys = st.monthsList.slice(-12);
    const vals = keys.map((k) => st.byMonth[k]);
    const max = Math.max(...vals, 1);
    // first and current months are usually partial, so leave them out of the average when possible
    const full = (keys.length > 3 ? keys.slice(1, -1) : keys).filter((k) => st.byMonth[k] > 0);
    const avg = full.length ? full.reduce((s, k) => s + st.byMonth[k], 0) / full.length : 0;
    $('#bars').innerHTML = keys.map((k, i) => `<button class="bar ${S.sel === k ? 'on' : ''}" data-k="${k}">
        <div class="bar-plot"><div class="bar-col" data-h="${(vals[i] / max) * 100}"><span class="bar-v">${vals[i] ? compact(vals[i]) : ''}</span></div></div>
        <div class="bar-l">${MONTHS[+k.slice(5) - 1]}</div></button>`).join('') +
      (avg ? `<div class="avg-layer"><div class="avg-line" style="bottom:${(avg / max) * 100}%"><span>avg ${compact(avg)}</span></div></div>` : '');
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#bars .bar-col').forEach((b) => (b.style.height = b.dataset.h + '%'))));
  }

  function avatar(name, c) {
    const ini = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
    return `<div class="m-av" style="background:linear-gradient(135deg, ${c}, color-mix(in srgb, ${c} 40%, #1a1440))">${esc(ini || '•')}</div>`;
  }

  function renderMerchants(st) {
    $('#merchants').innerHTML = st.merchants.map(([name, m]) => `<div class="m-row">${avatar(name, cat(m.cat).color)}
      <div class="m-info"><div class="m-name">${esc(name)}</div><div class="m-sub">${m.n} payment${m.n > 1 ? 's' : ''} · ${cat(m.cat).name}</div></div>
      <div class="amt">${inr(m.amt)}</div></div>`).join('') || '<div class="empty">No merchants yet</div>';
  }

  function renderWeek(st) {
    const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const max = Math.max(...st.week, 1), hi = st.week.indexOf(Math.max(...st.week));
    $('#week').innerHTML = st.week.map((v, i) => `<div class="wk ${i === hi && v ? 'hi' : ''}"><i data-h="${(v / max) * 100}"></i><span>${names[i]}</span></div>`).join('');
    requestAnimationFrame(() => requestAnimationFrame(() => $$('#week i').forEach((b) => (b.style.height = `calc((100% - 22px) * ${b.dataset.h / 100})`))));
    const dn = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][hi];
    $('#weekInsight').textContent = st.spent ? `${dn} are your heaviest spending day — ${inr(st.week[hi])} so far, ${Math.round(st.week[hi] / st.spent * 100)}% of the total.` : '';
  }

  function txRow(t) {
    const c = cat(t.category), d = new Date(t.date);
    return `<button class="tx" data-id="${esc(t.id)}">${avatar(t.merchant, c.color)}
      <div class="m-info"><div class="m-name">${esc(t.merchant)}</div>
      <div class="m-sub">${c.icon} ${c.name} · ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })} · ${esc(t.bank)}</div></div>
      <div class="amt ${t.type === 'credit' ? 'in' : ''}">${t.type === 'credit' ? '+' : '−'}${inr(t.amount)}</div></button>`;
  }

  function renderRecent(st) {
    $('#recent').innerHTML = st.tx.slice(0, 6).map(txRow).join('') || '<div class="empty">Nothing here yet</div>';
  }

  function renderActivity() {
    const chips = [['all', 'All'], ['income', '↙ Income'], ...Object.entries(CATEGORIES).map(([k, c]) => [k, c.icon + ' ' + c.name])];
    $('#actChips').innerHTML = chips.map(([k, l]) => `<button class="chip ${S.actCat === k ? 'on' : ''}" data-c="${k}">${l}</button>`).join('');
    const q = S.q.trim().toLowerCase();
    const list = S.txns.filter(inSel).filter((t) => S.actCat === 'all' || t.category === S.actCat)
      .filter((t) => !q || t.merchant.toLowerCase().includes(q) || t.bank.toLowerCase().includes(q) || String(Math.round(t.amount)).includes(q) || cat(t.category).name.toLowerCase().includes(q));
    const groups = [];
    list.forEach((t) => {
      const k = new Date(t.date).toDateString();
      let g = groups[groups.length - 1];
      if (!g || g.k !== k) groups.push((g = { k, d: t.date, items: [] }));
      g.items.push(t);
    });
    const today = new Date().toDateString(), yest = new Date(Date.now() - 864e5).toDateString();
    $('#txList').innerHTML = groups.slice(0, 120).map((g) => {
      const out = g.items.filter((t) => t.type === 'debit').reduce((s, t) => s + t.amount, 0);
      const lbl = g.k === today ? 'Today' : g.k === yest ? 'Yesterday' : new Date(g.d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
      return `<div class="day-h"><span>${lbl}</span><span>${out ? '−' + inr(out) : ''}</span></div><div class="tx-group">${g.items.map(txRow).join('')}</div>`;
    }).join('') || '<div class="empty">No transactions match</div>';
  }

  function renderSettings() {
    const when = S.scannedAt ? new Date(S.scannedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'never';
    $('#scanInfo').textContent = `Last analysis: ${when} · ${S.months} month${S.months > 1 ? 's' : ''} · ${S.txns.length} transactions${S.demo ? ' (demo data)' : ''}`;
  }

  function render() {
    const st = stats();
    renderMonthStrip(st);
    if (S.tab === 'overview') { renderHero(st); renderKpis(st); renderDonut(st); renderBars(st); renderMerchants(st); renderWeek(st); renderRecent(st); }
    if (S.tab === 'activity') renderActivity();
    if (S.tab === 'settings') renderSettings();
    $('#monthStrip').hidden = S.tab === 'settings';
  }

  function setTab(t) {
    S.tab = t;
    $$('.tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    ['overview', 'activity', 'settings'].forEach((v) => ($('#v-' + v).hidden = v !== t));
    window.scrollTo({ top: 0 });
    render();
  }

  function openApp() {
    const h = new Date().getHours();
    $('#greet').textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    show('#app');
    setTab(S.tab);
  }

  // ───────── sheets ─────────
  function sheet(html, onMount) {
    $('#sheetBody').innerHTML = html;
    $('#sheetWrap').hidden = false;
    onMount && onMount($('#sheetBody'));
  }
  const closeSheet = () => ($('#sheetWrap').hidden = true);

  function txSheet(id) {
    const t = S.txns.find((x) => x.id === id); if (!t) return;
    const d = new Date(t.date);
    const pickable = t.type === 'debit';
    sheet(`<div style="display:flex;gap:12px;align-items:center">${avatar(t.merchant, cat(t.category).color)}<div><h2>${esc(t.merchant)}</h2>
        <div class="muted small">${d.toLocaleString('en-IN', { dateStyle: 'full', timeStyle: 'short' })}</div></div></div>
      <div class="big ${t.type === 'credit' ? 'grad' : ''}">${t.type === 'credit' ? '+' : '−'}${inr(t.amount)}</div>
      <div class="muted small">${esc(t.bank)} · ${t.type === 'credit' ? 'Money received' : 'Money spent'}</div>
      <div class="raw">${esc(t.body)}</div>
      ${pickable ? `<div class="label">Category · applies to all “${esc(t.merchant)}”</div>
      <div class="cat-grid">${Object.entries(CATEGORIES).map(([k, c]) => `<button class="cat-pick ${t.category === k ? 'on' : ''}" style="--c:${c.color}" data-k="${k}"><b>${c.icon}</b>${c.name}</button>`).join('')}</div>` : ''}`,
      (root) => {
        root.querySelectorAll('.cat-pick').forEach((b) => (b.onclick = () => {
          const k = b.dataset.k, key = t.merchant.toLowerCase();
          S.overrides[key] = k; store.set('overrides', S.overrides);
          S.txns.forEach((x) => { if (x.type === 'debit' && x.merchant.toLowerCase() === key) x.category = k; });
          store.set('txns', S.txns);
          closeSheet(); render(); toast(`${t.merchant} → ${CATEGORIES[k].name}`);
        }));
      });
  }

  function catSheet(k) {
    const c = cat(k), list = S.txns.filter(inSel).filter((t) => t.type === 'debit' && t.category === k);
    const total = list.reduce((s, t) => s + t.amount, 0);
    sheet(`<div style="display:flex;gap:12px;align-items:center"><div class="cat-ic" style="--c:${c.color};width:48px;height:48px;font-size:22px">${c.icon}</div>
      <div><h2>${c.name}</h2><div class="muted small">${list.length} transactions · ${S.sel === 'all' ? 'last ' + S.months + ' months' : mlabel(S.sel, true)}</div></div></div>
      <div class="big">${inr(total)}</div><div style="margin-top:12px">${list.slice(0, 60).map(txRow).join('')}</div>`,
      (root) => root.querySelectorAll('.tx').forEach((b) => (b.onclick = () => txSheet(b.dataset.id))));
  }

  const HOWTO = `<ol class="steps">
      <li>On your Android phone, install <b>SMS Backup &amp; Restore</b> (by SyncTech) from the Play Store.</li>
      <li>Open it › <b>Set up a backup</b> › turn on <b>Messages</b> only › choose <b>Your phone</b> (local) › <b>Back up now</b>.</li>
      <li>Open this page in Chrome on the same phone, tap <b>Import SMS backup</b> and pick the <code>sms-….xml</code> file.</li>
    </ol>
    <p class="muted small">The file is read inside your browser. It is never uploaded — this site has no server.</p>`;

  function howtoSheet() {
    sheet(`<h2>Get your SMS backup</h2>${HOWTO}<button class="btn primary" id="hImport">Import SMS backup</button>`,
      (root) => (root.querySelector('#hImport').onclick = () => { closeSheet(); pickFile(); }));
  }

  function rescanSheet() {
    const hasRaw = !!(S.raw && S.raw.length);
    sheet(`<h2>Analysis period</h2><p class="muted small" style="margin:4px 0 0">${hasRaw ? 'Re-analyse your imported messages for a different period, or import a fresh backup.' : 'Pick a period, then import your SMS backup.'}</p>
      <div class="chips"></div>
      <div class="range-row"><input type="range" min="1" max="24"><div class="range-val"><b class="mp-val"></b> months</div></div>
      <div class="hint muted mp-since"></div>
      <div style="display:grid;gap:10px;margin-top:18px">
        ${hasRaw || S.demo ? `<button class="btn primary" id="goScan">Apply period</button>` : ''}
        <button class="btn ${hasRaw || S.demo ? 'ghost' : 'primary'}" id="goImport">Import new SMS backup</button>
        <button class="link" id="goHow" style="padding:6px">How do I get the backup file?</button>
      </div>`,
      (root) => {
        monthPicker(root);
        const g = root.querySelector('#goScan'); if (g) g.onclick = () => { closeSheet(); scan(S.months); };
        root.querySelector('#goImport').onclick = () => { closeSheet(); pickFile(); };
        root.querySelector('#goHow').onclick = howtoSheet;
      });
  }

  // ───────── events ─────────
  function bind() {
    $('#monthStrip').onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; S.sel = b.dataset.k; render(); b.scrollIntoView({ inline: 'center', behavior: 'smooth', block: 'nearest' }); };
    $('#bars').onclick = (e) => { const b = e.target.closest('.bar'); if (!b) return; S.sel = S.sel === b.dataset.k ? 'all' : b.dataset.k; render(); };
    $('#catList').onclick = (e) => { const b = e.target.closest('.cat-row'); if (b) catSheet(b.dataset.cat); };
    document.addEventListener('click', (e) => {
      const tx = e.target.closest('#recent .tx, #txList .tx'); if (tx) txSheet(tx.dataset.id);
      const g = e.target.closest('[data-goto]'); if (g) setTab(g.dataset.goto);
      if (e.target.closest('[data-close]')) closeSheet();
    });
    $$('.tabbar button').forEach((b) => (b.onclick = () => setTab(b.dataset.tab)));
    $('#actChips').onclick = (e) => { const b = e.target.closest('.chip'); if (b) { S.actCat = b.dataset.c; renderActivity(); } };
    $('#q').oninput = (e) => { S.q = e.target.value; renderActivity(); };
    $('#rescanBtn').onclick = rescanSheet;
    $('#setRescan').onclick = rescanSheet;
    $('#clearBtn').onclick = () => {
      if (!confirm('Clear all scanned transactions and category changes?')) return;
      ['txns', 'scannedAt', 'demo', 'overrides', 'raw'].forEach(store.del);
      S.txns = []; S.overrides = {}; S.scannedAt = 0; S.raw = null; S.demo = false;
      startOnboarding();
    };
    // Drag-and-drop a backup file anywhere (desktop)
    document.addEventListener('dragover', (e) => e.preventDefault());
    document.addEventListener('drop', (e) => { e.preventDefault(); importFile(e.dataTransfer.files[0]); });
  }

  function startOnboarding() {
    show('#onboard');
    const root = $('.ob-card');
    root.querySelector('.range-val b').classList.add('mp-val');
    root.querySelector('.hint').classList.add('mp-since');
    monthPicker(root);
    $('#obStart').onclick = pickFile;
    $('#obDemo').onclick = () => { S.demo = true; scan(S.months); };
    $('#obHow').onclick = howtoSheet;
  }

  // ───────── boot ─────────
  bind();
  const minSplash = new Promise((r) => setTimeout(r, 2300));
  minSplash.then(() => {
    $('#splash').classList.add('out');
    setTimeout(() => $('#splash').remove(), 650);
    if (S.txns.length) openApp(); else startOnboarding();
  });
})();
