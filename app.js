// Shopping Negotiator — UI wiring. Engine rules live in engine.js; seed data in data.js.
(function () {
  'use strict';
  var E = window.NegotiationEngine, D = window.SeedData;
  var $ = function (id) { return document.getElementById(id); };
  var fmt = function (n) { return '₹' + Math.round(n).toLocaleString('en-IN'); };
  var KEY = 'haggle.geminiKey', MODEL = 'haggle.geminiModel', HIST = 'haggle.history';

  var state = { request: null, ranked: [], selected: [], negs: [], timer: null, demo: false };

  function initSelects() {
    $('product').innerHTML = D.PRODUCTS.map(function (p) { return '<option>' + p + '</option>'; }).join('');
    $('city').innerHTML = D.CITIES.map(function (c) { return '<option>' + c + '</option>'; }).join('');
    $('model').value = localStorage.getItem(MODEL) || 'gemini-2.5-flash';
    updateKeyStatus();
  }

  function updateKeyStatus() {
    var has = !!localStorage.getItem(KEY);
    $('keyStatus').textContent = has
      ? 'Seller replies: Gemini AI (' + (localStorage.getItem(MODEL) || 'gemini-2.5-flash') + '). If a reply fails, the price ladder takes over.'
      : 'Seller replies: price ladder (no key). Add a free Gemini key in Settings for AI-written replies.';
  }

  function readRequest() {
    var budget = Number($('budget').value), target = Number($('target').value);
    var rounds = Number($('rounds').value);
    var err = $('formError'); err.classList.remove('show'); err.textContent = '';
    if (!isFinite(budget) || budget < 100) return fail('Budget must be at least ₹100.');
    if (!isFinite(target) || target < 100) return fail('Target price must be at least ₹100.');
    if (target > budget) return fail('Target price cannot be above your hard budget.');
    if (target < budget * 0.5) return fail('Target is under half your budget — raise it, or lower the budget.');
    if (!isFinite(rounds) || rounds < 2 || rounds > 8) return fail('Max rounds must be between 2 and 8.');
    return { product: $('product').value, budget: budget, targetPrice: target, maxRounds: rounds, city: $('city').value };
    function fail(msg) { err.textContent = msg; err.classList.add('show'); return null; }
  }

  function compare() {
    var req = readRequest(); if (!req) return false;
    state.request = req;
    stopTimer();
    state.negs = []; state.demo = false;
    $('negGrid').innerHTML = ''; $('dealArea').innerHTML = '';
    $('negEmpty').style.display = ''; $('guardArea').hidden = true;
    var listings = D.LISTINGS.filter(function (l) { return l.product === req.product; });
    var ranked = E.rankListings(listings, function (l) { return D.sellerById(l.sellerId).rating; });
    state.ranked = ranked;
    state.selected = ranked.slice(0, 3).map(function (r) { return r.listing.id; });
    renderResults(req, ranked);
    $('resultsCard').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }

  function renderResults(req, ranked) {
    $('resultsEmpty').style.display = 'none'; $('results').hidden = false;
    var maxTotal = Math.max.apply(null, ranked.map(function (r) { return r.total; }).concat([req.budget]));
    $('resultsBody').innerHTML = ranked.map(function (r) {
      var l = r.listing, s = D.sellerById(l.sellerId);
      var sel = state.selected.indexOf(l.id) !== -1;
      var over = r.total > req.budget;
      var why = sel ? '' : (over ? 'Over budget' : 'Lower score');
      return '<tr class="' + (sel ? 'sel' : '') + (over ? ' over' : '') + '">' +
        '<td><strong>' + l.title + '</strong><br><span style="color:var(--muted)">' + l.condition + ' · ' + l.city + ' · ' + l.postedDaysAgo + 'd ago<br>' + l.notes + '</span></td>' +
        '<td class="num"><strong>' + fmt(r.total) + '</strong><br><span style="color:var(--muted)">price ' + fmt(l.price) + ' + delivery ' + fmt(l.deliveryFee) + '</span></td>' +
        '<td><div class="scorebar"><i style="width:' + r.score + '%"></i></div>' + r.score + ' / 100</td>' +
        '<td>' + s.name + '<br><span style="color:var(--muted)">★ ' + s.rating.toFixed(1) + ' · ' + s.dealsDone + ' deals · ' + s.persona + '</span></td>' +
        '<td>' + (sel
          ? '<span class="chip green">Negotiating</span> <button class="btn ghost small" type="button" data-deselect="' + l.id + '">Remove</button>'
          : '<span class="chip">' + why + '</span> ' + (over ? '' : '<button class="btn ghost small" type="button" data-select="' + l.id + '">Add</button>')) + '</td></tr>';
    }).join('');
    $('chart').innerHTML = ranked.map(function (r) {
      var over = r.total > req.budget;
      return '<div class="bar-row"><span>' + r.listing.title.split('—')[0].trim() + ' · ' + D.sellerById(r.listing.sellerId).name + '</span>' +
        '<div class="bar-track' + (over ? ' over' : '') + '"><i style="width:' + Math.round(r.total / maxTotal * 100) + '%"></i>' +
        '<span class="budget-line" style="left:' + Math.round(req.budget / maxTotal * 100) + '%"></span></div>' +
        '<span class="num"><strong>' + fmt(r.total) + '</strong></span></div>';
    }).join('');
    $('chartLegend').innerHTML = 'Amber line = your budget <b>' + fmt(req.budget) + '</b>. Red bars are over budget. Accept limit is ' + fmt(req.targetPrice * 1.05) + ' (target + 5%).';
    var skipped = ranked.filter(function (r) { return state.selected.indexOf(r.listing.id) === -1; });
    $('skipNote').textContent = skipped.length
      ? 'Not picked: ' + skipped.map(function (r) { return D.sellerById(r.listing.sellerId).name + ' (' + (r.total > req.budget ? fmt(r.total) + ' is over budget' : 'score ' + r.score + ')'); }).join('; ') + '.'
      : '';
    $('startBtn').textContent = 'Start negotiating with ' + state.selected.length + ' seller' + (state.selected.length === 1 ? '' : 's');
    $('startBtn').disabled = state.selected.length === 0;
  }

  // --- Gemini (optional, key pasted by user) ---
  function geminiReply(seller, listing, buyerAmount, round, maxRounds) {
    var key = localStorage.getItem(KEY);
    if (!key) return Promise.resolve(null);
    var model = localStorage.getItem(MODEL) || 'gemini-2.5-flash';
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + encodeURIComponent(key);
    return fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: E.geminiPrompt(seller, listing, buyerAmount, round, maxRounds) }] }] })
    }).then(function (res) { if (!res.ok) throw new Error('Gemini ' + res.status); return res.json(); })
      .then(function (json) {
        var text = json && json.candidates && json.candidates[0] && json.candidates[0].content &&
          json.candidates[0].content.parts && json.candidates[0].content.parts[0] && json.candidates[0].content.parts[0].text;
        if (!text) return null;
        return E.parseGeminiReply(text, listing, seller.reservationPrice);
      })
      .catch(function () { return null; }); // any failure -> ladder fallback
  }

  // --- Negotiation runtime ---
  function startNegotiations() {
    if (!state.request || !state.selected.length) return;
    stopTimer();
    state.negs = state.selected.map(function (id) {
      var listing = D.listingById(id), seller = D.sellerById(listing.sellerId);
      var neg = E.newNegotiation(listing, seller, state.request);
      neg.messages.push({ by: 'system', text: 'Negotiation opened with ' + seller.name + ' (' + seller.persona + ' seller, ★ ' + seller.rating.toFixed(1) + ').', source: 'ladder' });
      return { neg: neg, listing: listing, seller: seller };
    });
    $('negEmpty').style.display = 'none';
    renderNegs();
    $('negotiate').scrollIntoView({ behavior: 'smooth', block: 'start' });
    var delay = state.demo ? 900 : 1600;
    state.timer = setInterval(stepAll, delay);
    stepAll();
  }

  function stepAll() {
    var active = false;
    var pending = [];
    state.negs.forEach(function (item) {
      if (item.neg.state === 'accepted' || item.neg.state === 'walked_away') return;
      active = true;
      // Compute the buyer offer for this round first so Gemini can reply to it.
      var nextRound = item.neg.round + 1;
      var buyerAmount = E.buyerOffer(state.request.targetPrice, state.request.budget, nextRound, state.request.maxRounds);
      pending.push(geminiReply(item.seller, item.listing, buyerAmount, nextRound, state.request.maxRounds)
        .then(function (reply) {
          E.runRound(item.neg, item.listing, item.seller, state.request, reply);
          if (item.neg.outcome) saveHistory(item);
        }));
    });
    Promise.all(pending).then(function () {
      renderNegs(); renderDealArea(); renderGuard();
      if (!state.negs.some(function (i) { return i.neg.state !== 'accepted' && i.neg.state !== 'walked_away'; })) stopTimer();
    });
    if (!active) stopTimer();
  }

  function stopTimer() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }

  function renderNegs() {
    $('negGrid').innerHTML = state.negs.map(function (item, idx) {
      var neg = item.neg, l = item.listing, s = item.seller, req = state.request;
      var done = neg.state === 'accepted' || neg.state === 'walked_away';
      var status = neg.state === 'accepted' ? '<span class="chip green">Deal closed</span>'
        : neg.state === 'walked_away' ? '<span class="chip red">Walked away</span>'
        : '<span class="chip amber">Round ' + neg.round + ' / ' + req.maxRounds + '</span>';
      var progress = Math.min(100, Math.round((neg.lastSeller !== null ? (l.price - neg.lastSeller) / Math.max(1, l.price - s.reservationPrice) : 0) * 100));
      var chat = neg.messages.map(function (m) {
        return '<div class="msg ' + (m.by === 'buyer' ? 'buyer' : m.by === 'seller' ? 'seller' : 'sys') + '">' +
          '<div class="who">' + (m.by === 'buyer' ? 'You (agent)' : m.by === 'seller' ? s.name + (m.source === 'gemini' ? ' · AI reply' : '') : 'System') + '</div>' +
          '<div class="text">' + escapeHtml(m.text) + '</div></div>';
      }).join('');
      return '<article class="neg"><header><div class="row"><span class="seller">' + s.name + '</span>' + status + '</div>' +
        '<div class="listing">' + l.title + ' · listed ' + fmt(l.price) + ' · ' + s.persona + ' seller · ★ ' + s.rating.toFixed(1) + '</div></header>' +
        '<div class="body"><div class="meter-label"><span>Current seller price</span><strong class="num">' + fmt(neg.lastSeller) + '</strong></div>' +
        '<div class="meter"><i style="width:' + Math.max(4, Math.min(100, neg.lastSeller / req.budget * 100)) + '%"></i></div>' +
        '<div class="meter-label"><span>Budget ' + fmt(req.budget) + ' · accept up to ' + fmt(req.targetPrice * 1.05) + '</span><span>round ' + neg.round + '/' + req.maxRounds + '</span></div>' +
        '<div class="chat">' + chat + '</div></div>' +
        (done ? '' : '<footer><button class="btn small" type="button" data-accept="' + idx + '">Accept ' + fmt(neg.lastSeller) + '</button>' +
          '<input type="number" min="100" step="100" placeholder="Counter ₹" data-counter-input="' + idx + '" aria-label="Counter amount">' +
          '<button class="btn ghost small" type="button" data-counter="' + idx + '">Counter</button>' +
          '<button class="btn danger small" type="button" data-walk="' + idx + '">Walk away</button></footer>') +
        '</article>';
    }).join('');
    // Keep each chat scrolled to the latest message.
    document.querySelectorAll('#negGrid .chat').forEach(function (c) { c.scrollTop = c.scrollHeight; });
  }

  function renderDealArea() {
    var won = state.negs.filter(function (i) { return i.neg.outcome === 'accepted'; });
    var allDone = state.negs.length && state.negs.every(function (i) { return i.neg.outcome; });
    if (!won.length && !allDone) { $('dealArea').innerHTML = ''; return; }
    if (won.length) {
      var best = won.map(function (i) { return { item: i, sum: E.dealSummary(i.neg, i.listing) }; })
        .sort(function (a, b) { return a.sum.finalPrice - b.sum.finalPrice; })[0];
      var s = best.sum, item = best.item;
      $('dealArea').innerHTML = '<div class="deal"><p class="kicker">Deal closed</p><h2>You got it for ' + fmt(s.finalPrice) + '</h2>' +
        '<div class="big num">' + fmt(s.finalPrice) + '</div>' +
        '<p>' + item.listing.title + ' from ' + item.seller.name + ', ' + item.listing.city + '. Closed in ' + s.roundsUsed + ' round' + (s.roundsUsed === 1 ? '' : 's') + '.</p>' +
        '<dl><dt>List price</dt><dd class="num">' + fmt(s.listPrice) + '</dd>' +
        '<dt>You saved</dt><dd class="num">' + fmt(s.saved) + ' (' + s.savedPct + '%)</dd>' +
        '<dt>Under budget by</dt><dd class="num">' + fmt(state.request.budget - s.finalPrice) + '</dd>' +
        '<dt>Other sellers</dt><dd>' + state.negs.filter(function (i) { return i !== item; }).map(function (i) { return i.seller.name + ': ' + i.neg.state.replace('_', ' '); }).join(' · ') + '</dd></dl>' +
        '<button class="btn ghost" type="button" id="newSearchBtn">Start a new search</button></div>';
      var b = $('newSearchBtn'); if (b) b.addEventListener('click', resetAll);
    } else {
      var bestCounter = state.negs.map(function (i) { return i.neg.lastSeller; }).filter(function (v) { return v !== null; });
      var bestPrice = bestCounter.length ? Math.min.apply(null, bestCounter) : null;
      $('dealArea').innerHTML = '<div class="deal" style="border-color:var(--amber)"><p class="kicker">No deal this time</p>' +
        '<h2>Every seller walked away above your limit.</h2>' +
        '<p style="margin-top:8px">The lowest counter received was ' + (bestPrice ? fmt(bestPrice) : '—') + ', against a budget of ' + fmt(state.request.budget) +
        ' and an accept limit of ' + fmt(state.request.targetPrice * 1.05) + '. Raise the target, raise the budget, or try another product.</p>' +
        '<button class="btn ghost" type="button" id="newSearchBtn" style="margin-top:14px">Start a new search</button></div>';
      var b2 = $('newSearchBtn'); if (b2) b2.addEventListener('click', resetAll);
    }
  }

  function renderGuard() {
    var lines = [];
    state.negs.forEach(function (i) { lines = lines.concat(i.neg.guardrailLog); });
    lines = lines.filter(function (l, idx) { return lines.indexOf(l) === idx; }); // one line per distinct check
    if (!lines.length) { $('guardArea').hidden = true; return; }
    $('guardArea').hidden = false;
    $('guardList').innerHTML = lines.map(function (l) { return '<li>' + escapeHtml(l) + '</li>'; }).join('') +
      '<li>Offers above budget this session: 0 accepted — every offer was checked before sending.</li>';
  }

  function saveHistory(item) {
    try {
      var hist = JSON.parse(localStorage.getItem(HIST) || '[]');
      hist.unshift({
        at: new Date().toISOString(), product: item.listing.product, seller: item.seller.name,
        outcome: item.neg.outcome, finalPrice: item.neg.finalPrice, listPrice: item.listing.price,
        rounds: item.neg.round
      });
      localStorage.setItem(HIST, JSON.stringify(hist.slice(0, 20)));
      renderHistory();
    } catch (e) { /* storage unavailable — history is a nice-to-have */ }
  }

  function renderHistory() {
    var hist = [];
    try { hist = JSON.parse(localStorage.getItem(HIST) || '[]'); } catch (e) { hist = []; }
    if (!hist.length) { $('historyList').innerHTML = '<p class="empty">Nothing yet — finished negotiations will show up here.</p>'; return; }
    $('historyList').innerHTML = hist.map(function (h) {
      return '<div class="history-item"><span><strong>' + escapeHtml(h.product) + '</strong> · ' + escapeHtml(h.seller) + ' · ' + new Date(h.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) + '</span>' +
        '<span class="num">' + (h.outcome === 'accepted' ? '<span class="chip green">Deal ' + fmt(h.finalPrice) + '</span>' : '<span class="chip red">Walked away</span>') + '</span></div>';
    }).join('');
  }

  function resetAll() {
    stopTimer(); state.negs = []; state.selected = []; state.ranked = [];
    $('results').hidden = true; $('resultsEmpty').style.display = '';
    $('negGrid').innerHTML = ''; $('dealArea').innerHTML = '';
    $('negEmpty').style.display = ''; $('guardArea').hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // --- Events ---
  $('requestForm').addEventListener('submit', function (e) { e.preventDefault(); compare(); });
  $('demoBtn').addEventListener('click', function () {
    $('product').value = 'Sony WH-1000XM5'; $('budget').value = 18000; $('target').value = 16500;
    $('rounds').value = 5; $('city').value = 'Bengaluru';
    if (!compare()) return;
    state.demo = true;
    startNegotiations();
  });
  $('startBtn').addEventListener('click', function () { state.demo = false; startNegotiations(); });

  document.addEventListener('click', function (e) {
    var t = e.target;
    var sel = t.getAttribute('data-select'), desel = t.getAttribute('data-deselect');
    if (sel) {
      if (state.selected.length >= 3) { alert('Three negotiations at once is the limit. Remove one first.'); return; }
      state.selected.push(sel); renderResults(state.request, state.ranked); return;
    }
    if (desel) { state.selected = state.selected.filter(function (id) { return id !== desel; }); renderResults(state.request, state.ranked); return; }
    var nav = t.getAttribute('data-nav');
    if (nav) { var el = $(nav === 'compare' ? 'compare' : nav === 'negotiate' ? 'negotiate' : 'history'); if (el) el.scrollIntoView({ behavior: 'smooth' }); return; }
    var acc = t.getAttribute('data-accept'), cnt = t.getAttribute('data-counter'), walk = t.getAttribute('data-walk');
    if (acc !== null && acc !== undefined) {
      var item = state.negs[Number(acc)];
      var res = E.manualAccept(item.neg, state.request);
      if (!res.ok) alert(res.error);
      else saveHistory(item);
      renderNegs(); renderDealArea(); renderGuard(); return;
    }
    if (cnt !== null && cnt !== undefined) {
      var it = state.negs[Number(cnt)];
      var input = document.querySelector('[data-counter-input="' + cnt + '"]');
      var amount = Number(input && input.value);
      var r = E.manualCounter(it.neg, amount, state.request);
      if (!r.ok) { alert(r.error); return; }
      if (r.clamped) alert('That counter was above your budget, so it was clamped to ' + fmt(r.amount) + '.');
      renderNegs(); renderGuard(); return;
    }
    if (walk !== null && walk !== undefined) {
      var w = state.negs[Number(walk)];
      E.walkAway(w.neg); saveHistory(w);
      renderNegs(); renderDealArea(); renderGuard(); return;
    }
  });

  $('settingsBtn').addEventListener('click', function () {
    $('apiKey').value = localStorage.getItem(KEY) || '';
    $('model').value = localStorage.getItem(MODEL) || 'gemini-2.5-flash';
    $('keyError').classList.remove('show');
    $('settingsModal').classList.add('show');
  });
  $('closeSettingsBtn').addEventListener('click', function () { $('settingsModal').classList.remove('show'); });
  $('settingsModal').addEventListener('click', function (e) { if (e.target === $('settingsModal')) $('settingsModal').classList.remove('show'); });
  $('saveKeyBtn').addEventListener('click', function () {
    var v = $('apiKey').value.trim();
    if (!v || v.length < 10) { var er = $('keyError'); er.textContent = 'That does not look like an API key. Paste the full key from Google AI Studio.'; er.classList.add('show'); return; }
    localStorage.setItem(KEY, v); localStorage.setItem(MODEL, $('model').value);
    updateKeyStatus(); $('settingsModal').classList.remove('show');
  });
  $('clearKeyBtn').addEventListener('click', function () {
    localStorage.removeItem(KEY); $('apiKey').value = ''; updateKeyStatus();
    $('settingsModal').classList.remove('show');
  });

  initSelects();
  renderHistory();
  // Screenshot / demo hook: ?shot=compare runs a comparison, ?shot=demo
  // runs the full 60-second demo. Plain query param, no other effect.
  var shot = new URLSearchParams(location.search).get('shot');
  if (shot === 'compare') { compare(); }
  else if (shot === 'demo') { $('demoBtn').click(); }
})();
