# Shopping Negotiator — PLAN.md (deepened to SaaS level)

## 1. One sentence
You type a product, a hard budget and a target price; the app compares
seeded listings, opens negotiations with the best sellers at once, and
haggles for you — never offering a rupee above your budget — until one
deal closes under it or every seller walks away.

## 2. Problem and user
Buying used or open-box gear (headphones, GPUs, bikes) means opening
six tabs, comparing prices by hand, and messaging sellers one by one,
waiting hours between replies. The buyer knows their budget; the seller
knows their lowest price; neither wants to say it first. The user is a
price-aware buyer in India (student, first-job buyer, deal hunter) who
wants the best price without spending an evening haggling in chat.

## 3. Product (this build, demoable in 24–48h)
A single-page web app. No account, no server, no key required to demo.
All listings and sellers live in a **seeded simulated marketplace** and
are labelled as such on screen ("Simulated marketplace — seller bots").
Live AI seller replies are an opt-in upgrade: paste a free Gemini API
key in Settings (localStorage only, never sent anywhere else) and seller
replies come from Gemini; without a key the deterministic price-ladder
fallback runs the whole negotiation and a deal can still close.

### Stack — verified 23 Nov 2026, and one honest deviation
- Verified: Next.js **16.4.6** (latest stable, 9 Nov 2026; 16.4.5 was the
  3 Nov security release), Gemini free-tier model **`gemini-2.5-flash`**
  (free of charge on the free tier; `gemini-3.8-flash` also free — kept
  as a fallback model id), Hanken Grotesk (Google Fonts, OFL-1.1,
  variable 100–900).
- Deviation, stated plainly: the plan specified Next.js + FastAPI +
  LangGraph + SQLite. This hackathon build ships the same negotiation
  state machine and the same guardrails as a **dependency-free static
  app (plain HTML/CSS/JS, no build step, runs from `file://`)**. Reason:
  it must demo with no server, no key and no install in the judging
  room, and screenshots must render in headless Chrome, which cannot
  reach external HTTPS here. The state machine
  (`offer → counter → accept / walk away`) is implemented in
  `engine.js` with the exact states LangGraph would hold, and the
  production path (Next.js 16.4.6 + FastAPI + LangGraph + SQLite, one
  LangGraph agent per seller, rows in SQLite) is documented in §10.
  Nothing about the demo behaviour depends on the deviation.

### Design identity (this project alone)
- Deep green `#14532D`, paper `#F7F4EC`, ink `#16211A`, muted
  `#5C6B60`, line `#D8D2C4`, amber `#B45309` for warnings, red
  `#B42318` for walk-aways. No gradients, no glows.
- Type: **Hanken Grotesk** (Google Fonts link, system-sans fallback
  offline) for everything; tabular figures for all money.
- Signature idea: the **haggle ledger** — every negotiation reads like
  a ruled shop bill: one row per move, price on the right, running
  total of what you saved. Repeated in the comparison table, the chat
  and the deal summary.
- References (design-playbook): **Mobbin** (dense dashboard rows,
  left-rail navigation, per-item progress) and **Linear.app** (tight
  type scale, restrained colour, one accent doing all the work).
  Borrowed: Mobbin's row density and status chips; Linear's
  13/20px body, 800-weight headings, hairline dividers.

## 4. Feature set
1. **Request form** — product (search across seeded catalogue),
   hard budget cap (₹), target price (₹), max rounds (2–8), city.
   Validation: budget > 0, target ≤ budget, target ≥ 50% of budget
   (warns, does not block), max rounds within range.
2. **Comparison engine** — scores every matching listing on price
   (50%), condition (20%), seller rating (20%), delivery cost (10%).
   Table shows price, condition, seller, rating, delivery, total cost
   (price + delivery), deal score /100, and a bar chart of total cost
   vs your budget line. Sortable by price, score, rating.
3. **Negotiation picker** — the app pre-selects the top 3 by score;
   the user can add/remove sellers (max 3 at once). Sellers the app
   skips are shown with the reason ("₹2,400 over budget",
   "rating 3.1 — too low").
4. **Negotiation state machine** (per seller, in code, not in a
   prompt): states `idle → offered → countered → accepted | walked_away
   | expired`. Buyer opens at the target price (or the first rung of
   the ladder). Each round the buyer rises by a fixed step and the
   seller falls by a persona step. Guardrails, enforced in `engine.js`
   before any message is sent:
   - the buyer can **never** offer above the hard budget (clamped,
     and the clamp is logged);
   - the buyer can **never** accept above target + tolerance
     (tolerance = 5% of target, shown on screen);
   - after `maxRounds` rounds with no accept, the agent walks away
     automatically and logs why;
   - a manual counter above budget is rejected in the UI with the
     exact overage shown.
5. **Seller personas** (hidden reservation price per seller, never
   shown to the user): *Firm* — reservation 95% of asking, moves
   ₹150–250/round, rarely accepts below 93%; *Flexible* — reservation
   82% of asking, moves ₹400–700/round; *Slow* — replies after a
   delay and skips the first round half the time (deterministic in
   the seeded demo: skips round 1), reservation 88%.
6. **Live dashboard** — one card per active negotiation: seller,
   listing, current price, rounds used / max, progress bar, budget
   meter, chat transcript, and controls (Accept, Counter with a
   custom amount, Walk away). Messages stream in with a short delay
   so the haggle is watchable; Demo mode compresses it to ~60s.
7. **Deal summary** — when a deal closes: final price, list price,
   amount saved, rounds used, full transcript, guardrail log
   ("0 offers above budget, 0 accepts above target + tolerance").
   If all sellers walk away: a plain summary of the best counter
   received and the gap to budget.
8. **Settings** — Gemini API key field (paste, save to localStorage,
   clear button), model picker (`gemini-2.5-flash` default,
   `gemini-3.8-flash` fallback), toggle for "AI seller replies"
   (off without a key). The key is never displayed after saving and
   never leaves the browser except to Google's API.
9. **History** — completed negotiations saved in localStorage; a
   history list lets the user reopen any past deal or walk-away.
10. **Demo mode** — one button ("Run the 60-second demo") fills the
    Sony WH-1000XM5 / ₹18,000 / Bengaluru request and plays all three
    negotiations to their endings.

## 5. Data model
```
Listing   { id, product, title, price, condition: new|like-new|good|fair,
            sellerId, city, deliveryFee, postedDaysAgo, notes }
Seller    { id, name, rating (0–5), dealsDone, persona: firm|flexible|slow,
            reservationPrice (hidden), city, respondsInMin }
Request   { product, budget, targetPrice, maxRounds, city }
Negotiation { id, listingId, sellerId, state, round, offers: Offer[],
              messages: Message[], outcome: accepted|walked_away|expired|null,
              finalPrice|null, guardrailLog: string[] }
Offer     { by: buyer|seller, amount, round, at }
Message   { by: buyer|seller|system, text, at, source: ladder|gemini }
DealScore { listingId, score, breakdown: {price, condition, rating, delivery} }
```
Seed: 15 listings across 3 products — Sony WH-1000XM5 (6), NVIDIA
RTX 4060 8GB (5), Firefox Target 26" cycle (4) — in Bengaluru,
Mumbai, Delhi, Hyderabad and Chennai. Prices, conditions, ratings and
delivery fees are fixed seed data, labelled "Seeded demo listings".

## 6. User flow, end to end
1. Land on the app. The header states the limit in plain words:
   "Simulated marketplace — seller bots. This app cannot message real
   sellers on OLX, Facebook Marketplace or eBay."
2. Type or pick a product (e.g. "Sony WH-1000XM5"), budget ₹18,000,
   target ₹16,500, max rounds 5, city Bengaluru. Press "Compare listings".
3. The comparison table appears with scores and the price-vs-budget
   chart. The top 3 sellers are pre-selected, with a one-line reason
   each ("Lowest total cost", "Best rating under budget",
   "Flexible seller, room to move").
4. Press "Start negotiating with 3 sellers". Three negotiation cards
   open. The buyer offer goes out first at the target price.
5. Watch replies arrive: counters, a firm seller holding high, a
   flexible seller dropping fast, a slow seller silent for round 1.
   The budget meter never passes the cap; the guardrail log grows.
6. Either a seller accepts at or under target + tolerance (deal card,
   savings shown), or the user accepts a counter manually, or rounds
   run out and the agent walks away with the reason logged.
7. The deal summary shows final price, saved vs list, transcript and
   guardrail log. "Start a new search" resets; history keeps the deal.

## 7. 2-minute demo script
- **0:00–0:20** — "Comparing listings and haggling by hand takes an
  evening. I type Sony WH-1000XM5, max ₹18,000, Bengaluru — and the
  agent does the rest. These are seeded demo listings with seller
  bots, not real sellers."
- **0:20–0:50** — Comparison table: six XM5 listings, scored on price,
  condition, rating and delivery. "It picks three: the cheapest total
  cost, the best-rated seller, and the flexible one with room to move.
  The other three are out — one is over budget, one is rated 3.1."
- **0:50–1:30** — Live haggle. "Watch the ledger: we open at ₹16,500.
  The firm seller drops ₹200 a round. The flexible seller drops ₹600.
  The slow seller says nothing in round 1. Round 4, the flexible
  seller accepts ₹17,200 — under budget. The firm seller is walked
  away from after round 5."
- **1:30–2:00** — Deal summary: "₹17,200, saved ₹2,300 off list.
  Guardrail log: zero offers above budget, zero accepts above target.
  The budget cap is enforced in code, not in a prompt — the agent
  physically cannot offer more. With a free Gemini key in Settings,
  the seller replies are written by the model instead of the ladder;
  without one, the ladder runs the same negotiation."

## 8. Guardrails and honesty rules (enforced in code)
- `clampOffer(amount, budget)` — any buyer amount above budget is
  clamped to budget and the clamp is logged; tested.
- `canAccept(amount, target)` — accept only if
  `amount <= target * 1.05`; tested.
- Seller counters from Gemini are parsed, then clamped to
  `[reservationPrice, askingPrice]`; a reply with no usable number
  falls back to the ladder; a Gemini failure falls back to the ladder.
- Reservation prices are never rendered in the UI. The user sees
  offers, counters and outcomes only.
- No real-marketplace messaging exists in the code. No listing is
  presented as a real seller. History is local only.

## 9. Testing
Node's built-in test runner (`node --test`), no dependencies:
guardrail clamps, accept rule, ladder convergence, walk-away after
max rounds, score ordering, seller-persona steps, deal-summary math,
Gemini reply parsing/clamping. Target: 0 failures; exact count
reported in README and the final report.

## 10. Production path (v2, not built here)
Next.js 16.4.6 (App Router) + Tailwind, FastAPI + SQLite, LangGraph
(one agent per seller, states as in §4.4), Gemini `gemini-2.5-flash`
for seller replies and deal scoring, real auth, saved searches,
price-drop alerts, and a "message a real seller" draft composer
(the user sends it themselves — the app never logs into a
marketplace). Estimated effort: 2–3 weeks for one engineer.

## 11. Launch checklist
- [x] Seeded marketplace (15 listings, 3 products, 3 personas)
- [x] Comparison + scoring + chart
- [x] Negotiation engine + guardrail tests, 0 failures
- [x] Live dashboard, demo mode, deal summary, history
- [x] Gemini key in Settings, ladder fallback
- [x] Desktop 1280px + mobile 390px screenshots, zero overflow
- [x] README + MIT LICENSE
- [ ] (Blocked, needs Siva) Create public GitHub repo `shopping-negotiator`, then push
