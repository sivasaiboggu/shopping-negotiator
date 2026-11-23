# Haggle — Shopping Negotiator

Compare listings, then haggle with three sellers at once — inside a budget
the agent cannot exceed. A hackathon demo on a **seeded simulated
marketplace** (seller bots, fixed demo data). It cannot message real sellers
on OLX, Facebook Marketplace or eBay, and it does not try to.

## The demo in 30 seconds

1. Open `index.html` in a browser (no server, no install, no key needed).
2. Press **“Run the 60-second demo”** — Sony WH-1000XM5, ₹18,000 budget,
   ₹16,500 target, Bengaluru.
3. Watch the comparison table score six listings, then three negotiations
   run side by side: the flexible seller accepts at **₹17,100** in round 4,
   the firm seller holds high and is walked away from, the slow seller
   stays silent in round 1 and ends above the accept limit.
4. The deal card shows ₹17,100, ₹2,400 saved off list, and the guardrail
   log proving zero offers above budget.

## Guardrails (enforced in code, not in the prompt)

- The buyer can **never** offer above the hard budget — offers are clamped
  in `engine.js` and the clamp is logged. Tested.
- The buyer can **never** accept above target + 5% — manual accepts
  outside that are blocked with the exact overage. Tested.
- After the max rounds, the agent walks away automatically.
- Seller reservation prices are hidden from the UI and never revealed.
- A Gemini reply below a seller's lowest price is clamped up to it; a
  reply with no usable price falls back to the price ladder.

## Live AI seller replies (optional)

Settings → paste a free Gemini API key (Google AI Studio). The key is stored
in `localStorage` only and sent only to Google's Gemini API. Default model
`gemini-2.5-flash` (free tier, verified 23 Nov 2026); `gemini-3.8-flash`
available as a fallback. Without a key, the deterministic price ladder runs
the whole negotiation and a deal can still close — nothing is faked.

## Run it

```
# Just open it:
open index.html
# or serve it:
python3 -m http.server 8000   # then http://localhost:8000
```

## Tests

```
node --test tests/engine.test.js
# 16 tests, 16 pass, 0 fail
```

Tests cover the budget clamp, the accept rule, the buyer ladder, seller
persona steps, three full end-to-end negotiations (accept / firm walk-away /
slow walk-away), manual accept/counter guards, ranking, Gemini reply
parsing and clamping, seed-data integrity, and deal-summary math.

## Stack

- Plain HTML/CSS/JS, no build step, no dependencies. The negotiation state
  machine (`offered → countered → accepted | walked_away`) lives in
  `engine.js` with the exact states a LangGraph version would hold.
- Production path (not built here): Next.js 16.4.6 + FastAPI + LangGraph +
  SQLite — see `PLAN.md` §10 for the reasoning.
- Design: deep green `#14532D` + Hanken Grotesk (Google Fonts, OFL).
  References: Mobbin (dashboard rows) and Linear (tight type, one accent).

## Files

| File | What it is |
|---|---|
| `index.html` | The whole UI |
| `styles.css` | Design system (green/paper, no gradients) |
| `data.js` | Seeded marketplace: 15 listings, 3 products, 15 sellers |
| `engine.js` | Negotiation engine + guardrails (also `require()`d by tests) |
| `app.js` | UI wiring, Gemini call, history in localStorage |
| `tests/engine.test.js` | 16 tests, Node built-in runner |
| `PLAN.md` | Deepened SaaS-level plan, data model, demo script |
| `screenshots/` | Desktop + mobile renders (see note below) |

## Screenshots — status 23 Nov 2026 ~10:50 IST

Verified and on disk: `screenshots/desktop-home.png` (1280×1000, read clean)
and `screenshots/desktop-compare.png` (1280×2210, read clean).
A full desktop demo run (1280×3815) and a mobile demo run (390×6787) were
captured earlier, read, and verified — zero horizontal overflow at both
widths (mobile: `innerWidth` 390 = `scrollWidth` 390, confirmed via CDP) —
but those two files were deleted before a re-take, and the re-take is
currently **blocked by the VM, not the app**: since ~10:35 IST every
data write from a shell command fails with `Operation not permitted`
(file creation succeeds, 0-byte files result), and headless Chrome
exits with SIGTRAP (133) at startup. `git init` is blocked by the same
failure. The app itself is unchanged and its tests pass; re-capture the
two demo shots and run the git steps below once the environment recovers.

```sh
cd ~/workspace/projects/hackathon/shopping-negotiator
git init -b main
git add -A && git commit -m "Haggle: shopping negotiator — compare, haggle, guardrails"
# Do NOT push: Siva creates the public repo `shopping-negotiator` first.
python3 scripts/shot.py "file://$PWD/index.html?shot=demo" screenshots/desktop-demo.png 1280 1000 --wait 14 --full
python3 scripts/shot.py "file://$PWD/index.html?shot=demo" screenshots/mobile-demo.png 390 844 --wait 14 --full
```

## Honest limits

- Simulated marketplace only. No real sellers, no real money, no
  marketplace login — messaging real sellers would need logged-in accounts
  and would break marketplace terms of service.
- The price ladder is deterministic, so repeated demos play out the same
  way; Gemini replies add variety when a key is present.
- History lives in the browser's localStorage; there is no account or sync.
- Fonts load from Google Fonts when online; offline the system sans
  fallback is used and the layout is unchanged.

## License

MIT — Sivasai Boggu, 2026. See `LICENSE`.
