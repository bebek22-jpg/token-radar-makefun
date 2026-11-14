// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail drawer with the model's own
// inputs and the farm plan board.json carries, and the live-token panel. No network: every byte
// it shows is in data.js. The page recomputes each row's implied value from the snapshot figures,
// so the page's arithmetic and the board's data are visibly the same model.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', chain: 'all', scope: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var bySlug = {};
  DATA.rows.forEach(function (r) { bySlug[r.slug] = r; });

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function, mirroring lib/model.ts: category multiple, momentum from 7d growth,
  // a saturating maturity curve over the time run with no token, and multi-chain breadth.
  function categoryMultiple(category) {
    var c = (category || '').toLowerCase();
    for (var i = 0; i < DATA.category_rules.length; i++) {
      if (c.indexOf(DATA.category_rules[i].key) >= 0) return DATA.category_rules[i].multiple;
    }
    return DATA.model.default_multiple;
  }
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + m.maturity_range * (1 - Math.exp(-Math.max(age, 0) / m.maturity_tau_days));
    var breadth = Math.min(m.breadth_cap, 1 + m.breadth_weight * Math.log(Math.max(1, (row.chains || []).length)));
    return Math.max(1, Math.round(row.tvl_usd * categoryMultiple(row.category) * growthMult * maturity * breadth));
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('scope')) state.scope = params.get('scope');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.scope !== 'all') params.set('scope', state.scope);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.scope === 'watchlist' && !r.watchlist) return false;
      if (state.scope === 'early' && r.watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function sortArrow(key) {
    if (state.sort !== key) return '';
    return state.dir < 0 ? ' &#9660;' : ' &#9650;';
  }
  function sortTh(key, label) {
    return '<th scope="col"><button type="button" data-sort="' + key + '">' + label + sortArrow(key) + '</button></th>';
  }
  function growthCell(r) {
    if (r.change_7d === null || r.change_7d === undefined) return '<td class="num">n/a</td>';
    return '<td class="num ' + (r.change_7d >= 0 ? 'pos' : 'neg') + '">' + fmtPct(r.change_7d) + '</td>';
  }
  function chainsCell(r) {
    var chains = r.chains || [];
    if (chains.length === 0) return '<td class="num">—</td>';
    return '<td class="num">' + chains.length + ' <span class="sub">' + esc(chains.slice(0, 2).join(', ')) + (chains.length > 2 ? ' +' + (chains.length - 2) : '') + '</span></td>';
  }

  function boardTableHtml() {
    var list = sortedRows(filteredRows());
    if (list.length === 0) {
      return '<div class="panel"><div class="empty"><h2>No protocol matches that filter</h2>' +
        '<p>Clear the search or pick another category, chain or scope to see the board again.</p>' +
        '<button class="button primary" type="button" id="clear-filters">Clear filters</button></div></div>';
    }
    var max = list.reduce(function (m, r) { return Math.max(m, r.implied_value_usd); }, 1);
    var rows = list.map(function (r) {
      var badge = r.watchlist ? '<span class="badge watch">WATCHLIST</span>' : '<span class="badge early">EARLY</span>';
      var pct = Math.max(3, Math.round((r.implied_value_usd / max) * 100));
      return '<tr data-slug="' + esc(r.slug) + '" data-selected="' + (state.selected === r.slug ? 'true' : 'false') + '" tabindex="0">' +
        '<td class="num">' + r.rank + '</td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' + growthCell(r) +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' + chainsCell(r) +
        '<td><div class="implied"><div class="bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div><span class="num">' + fmtUsd(r.implied_value_usd) + '</span></div></td>' +
        '<td>' + badge + '</td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.</caption>' +
      '<thead><tr>' + sortTh('implied', 'Rank') + sortTh('name', 'Protocol') + sortTh('tvl', 'TVL') + sortTh('growth', '7d') +
      sortTh('age', 'Age') + '<th scope="col">Chains</th>' + sortTh('implied', 'Implied value') + '<th scope="col">Scope</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  function liveTableHtml() {
    var rows = DATA.live.map(function (r) {
      var ratio = (r.mcap_usd !== null && r.mcap_usd !== undefined && r.tvl_usd > 0) ? (r.mcap_usd / r.tvl_usd).toFixed(2) + 'x' : 'n/a';
      return '<tr><td><span class="badge live">LIVE</span></td>' +
        '<td><div class="name"><b>' + esc(r.name) + '</b><span class="sub">' + esc(r.category || 'Other') + '</span></div></td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' + growthCell(r) +
        '<td class="num">' + fmtUsd(r.mcap_usd) + '</td><td class="num">' + ratio + '</td></tr>';
    }).join('');
    return '<div class="panel"><div class="table-wrap"><table>' +
      '<caption>Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking — the radar ranks only what is still to come.</caption>' +
      '<thead><tr><th scope="col">Status</th><th scope="col">Protocol</th><th scope="col">TVL</th><th scope="col">7d</th><th scope="col">Market cap</th><th scope="col">Mcap / TVL</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div></div>';
  }

  var panelEl, countEl, modelEl, dialog;

  function renderTable() {
    panelEl.innerHTML = state.tab === 'pre-token' ? boardTableHtml() : liveTableHtml();
    var shown = state.tab === 'pre-token' ? filteredRows().length : DATA.live.length;
    countEl.textContent = state.tab === 'pre-token' ? shown + ' of ' + DATA.board_size + ' rows shown' : DATA.live.length + ' live-token protocols';
    modelEl.style.display = state.tab === 'pre-token' ? '' : 'none';
    var clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.scope = 'all';
      document.getElementById('q').value = '';
      document.getElementById('category').value = 'all';
      document.getElementById('chain').value = 'all';
      syncChips(); writeHash(); renderTable();
    });
    panelEl.querySelectorAll('[data-sort]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var key = btn.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = -1; }
        renderTable();
      });
    });
    panelEl.querySelectorAll('tbody tr[data-slug]').forEach(function (tr) {
      tr.addEventListener('click', function () { openDetail(tr.getAttribute('data-slug')); });
      tr.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(tr.getAttribute('data-slug')); }
      });
    });
  }

  function syncChips() {
    document.querySelectorAll('[data-scope]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-scope') === state.scope ? 'true' : 'false');
    });
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', btn.getAttribute('data-tab') === state.tab ? 'true' : 'false');
    });
  }

  function openDetail(slug) {
    var row = bySlug[slug];
    if (!row) return;
    state.selected = slug;
    writeHash();
    var recomputed = impliedOf(row);
    var match = recomputed === row.implied_value_usd;
    var steps = row.farm_steps.map(function (s) {
      var at = s.indexOf(' Cost: ');
      var action = at >= 0 ? s.slice(0, at) : s;
      var tail = at >= 0 ? s.slice(at + 1) : '';
      return '<li><b>' + esc(action) + '</b><span class="cost">' + esc(tail) + '</span></li>';
    }).join('');
    dialog.innerHTML =
      '<div class="detail-head"><div><span class="sub">Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' + (row.watchlist ? 'Watchlist' : 'Early radar') + '</span>' +
      '<h2 id="detail-title">' + esc(row.name) + '</h2>' +
      '<p class="sub">' + esc(row.category || 'Other') + ' on ' + esc((row.chains || []).join(', ') || 'an unnamed chain') + '</p></div>' +
      '<button class="close" type="button" aria-label="Close details" id="detail-close">Close</button></div>' +
      '<section class="detail-section"><h3>Implied value — the model, line by line</h3><div class="equation">' +
      '<div><span>TVL</span><b class="num">' + fmtUsd(row.tvl_usd) + '</b></div>' +
      '<div><span>Category multiple (' + esc(row.category || 'Other') + ')</span><b class="num">x' + row.category_multiple.toFixed(2) + '</b></div>' +
      '<div><span>7d growth ' + fmtPct(row.change_7d) + '</span><b class="num">x' + row.growth_multiplier.toFixed(2) + '</b></div>' +
      '<div><span>Age with no token (' + fmtAge(row.age_days) + ')</span><b class="num">x' + row.maturity_multiplier.toFixed(2) + '</b></div>' +
      '<div><span>Breadth (' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + ')</span><b class="num">x' + row.breadth_multiplier.toFixed(2) + '</b></div>' +
      '<div class="total"><span>Implied value</span><b class="num">' + fmtUsd(row.implied_value_usd) + '</b></div>' +
      '</div><p class="check">This page recomputes the row from the snapshot figures as <b>' + fmtUsd(recomputed) + '</b>' +
      (match ? ' — the same number board.json carries.' : ' — which differs from the board: the data would be stale.') +
      ' An estimate, not a price; it says nothing about whether or when a token is issued.</p></section>' +
      '<section class="detail-section"><h3>Farm plan</h3><ol class="steps">' + steps + '</ol></section>';
    document.getElementById('detail-close').addEventListener('click', function () { dialog.close(); });
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function buildShell() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var movers = DATA.movers.map(function (slug) {
      var r = bySlug[slug];
      if (!r) return '';
      return '<button class="mover" type="button" data-mover="' + esc(r.slug) + '"><b>' + esc(r.name) + '</b><span class="num pos">' + fmtPct(r.change_7d) + '</span><span class="sub">7d</span></button>';
    }).join('');
    var m = DATA.model;
    var rules = DATA.category_rules.map(function (rule) {
      return '<span class="rule">' + esc(rule.label) + ' <b>x' + rule.multiple.toFixed(2) + '</b></span>';
    }).join('');
    var formula = 'implied = round( tvl_usd x category_multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap +
      ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + ' + m.maturity_range + ' x (1 - e^(-age_days / ' + m.maturity_tau_days +
      '))) x min(' + m.breadth_cap + ', 1 + ' + m.breadth_weight + ' x ln(chains)) )';

    app.innerHTML =
      '<div class="shell">' +
      '<header class="top"><div class="brand"><span class="radar" aria-hidden="true"></span><div><div class="brand-name">TOKEN RADAR</div><div class="brand-sub">Pre-token protocols, ranked by implied value</div></div></div>' +
      '<div class="top-meta"><span>Snapshot ' + esc(DATA.as_of) + '</span><span>DefiLlama protocol index</span><span>' + esc(DATA.model_version) + ' model</span></div></header>' +
      '<section class="lede"><div><h1>' + DATA.watchlist_size + ' watchlist protocols, ranked by what a launch would be worth</h1>' +
      '<p>The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL that records no token and is not a wrapped, staked or bridged product of one that trades. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, scored by the same model. Implied value is a model, not a promise — and it says nothing about whether or when a token is issued.</p></div>' +
      '<div class="stats">' +
      '<div class="stat"><b class="green">' + DATA.watchlist_size + ' / ' + DATA.watchlist_size + '</b><span>Watchlist covered</span></div>' +
      '<div class="stat"><b>' + DATA.board_size + '</b><span>Pre-token rows scored</span></div>' +
      '<div class="stat"><b>' + DATA.early_size + '</b><span>Early rows below the floor</span></div>' +
      '<div class="stat"><b>' + fmtUsd(DATA.total_implied_usd) + '</b><span>Total implied value</span></div>' +
      '</div></section>' +
      '<div class="movers"><span class="movers-label">Fastest growing this week</span>' + movers + '</div>' +
      '<div class="controls">' +
      '<div class="field"><label for="q">Search</label><input type="search" id="q" placeholder="Search name, category or chain" value="' + esc(state.q) + '" aria-label="Search the board"></div>' +
      '<div class="field"><label for="category">Category</label><select id="category" aria-label="Filter by category"><option value="all">All categories</option>' +
      categories.map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label for="chain">Chain</label><select id="chain" aria-label="Filter by chain"><option value="all">All chains</option>' +
      chains.map(function (c) { return '<option value="' + esc(c) + '"' + (c === state.chain ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
      '<div class="field"><label>Scope</label><div class="chips"><button type="button" data-scope="all">All</button><button type="button" data-scope="watchlist">Watchlist</button><button type="button" data-scope="early">Early</button></div></div>' +
      '<div class="field"><label>Token status</label><div class="tabs"><button type="button" data-tab="pre-token">Pre-token</button><button type="button" data-tab="live">Live token</button></div></div>' +
      '<span class="count" id="count"></span></div>' +
      '<div id="board-panel"></div>' +
      '<section class="panel model" id="model-panel"><h2>How implied value is computed</h2>' +
      '<p class="sub">One function scores every row, from the snapshot figures alone. No protocol name is special-cased, and no row is hand-picked.</p>' +
      '<div class="formula">' + esc(formula) + '</div>' +
      '<div class="rules">' + rules + '<span class="rule">Everything else <b>x' + m.default_multiple.toFixed(2) + '</b></span></div>' +
      '<p class="sub">TVL, seven-day growth, listing age and chain count come from the snapshot. Age is the time since the protocol was first listed — the best record of how long it has run with no token; an unlisted age counts as ' + m.unknown_age_days + ' days. Growth is clamped so one wild week cannot dominate, maturity saturates so age stops paying after a few years, and breadth rewards TVL spread over many chains. Live-token protocols are set aside with their market caps shown.</p></section>' +
      '<footer class="foot"><span>Source: ' + esc(DATA.source) + '</span><span>“Records no token” is DefiLlama\u2019s record, not proof: a protocol on the board may still have a token its record does not carry. Implied values are this entry\u2019s own claim, never make.fun\u2019s.</span></footer>' +
      '</div>';

    panelEl = document.getElementById('board-panel');
    countEl = document.getElementById('count');
    modelEl = document.getElementById('model-panel');
    dialog = document.createElement('dialog');
    dialog.className = 'detail';
    dialog.id = 'detail';
    dialog.setAttribute('aria-labelledby', 'detail-title');
    dialog.addEventListener('close', function () { state.selected = null; writeHash(); renderTable(); });
    app.appendChild(dialog);

    document.getElementById('q').addEventListener('input', function (e) { state.q = e.target.value; writeHash(); renderTable(); });
    document.getElementById('category').addEventListener('change', function (e) { state.category = e.target.value; writeHash(); renderTable(); });
    document.getElementById('chain').addEventListener('change', function (e) { state.chain = e.target.value; writeHash(); renderTable(); });
    document.querySelectorAll('[data-scope]').forEach(function (btn) {
      btn.addEventListener('click', function () { state.scope = btn.getAttribute('data-scope'); syncChips(); writeHash(); renderTable(); });
    });
    document.querySelectorAll('[data-tab]').forEach(function (btn) {
      btn.addEventListener('click', function () { state.tab = btn.getAttribute('data-tab'); syncChips(); writeHash(); renderTable(); });
    });
    document.querySelectorAll('[data-mover]').forEach(function (btn) {
      btn.addEventListener('click', function () { openDetail(btn.getAttribute('data-mover')); });
    });
    syncChips();
    renderTable();
    app.setAttribute('aria-busy', 'false');
    if (state.selected) openDetail(state.selected);
    window.__shotReady = true;
  }

  readHash();
  buildShell();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog && dialog.open) dialog.close();
  });
})();
