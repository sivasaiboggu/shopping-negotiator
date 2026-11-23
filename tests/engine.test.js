// Tests for the negotiation engine — run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../engine.js');
const D = require('../data.js');

const seller = (persona, reservationPrice) => ({ id: 's', name: 'Test Seller', rating: 4.5, dealsDone: 10, persona, reservationPrice });
const listing = (price) => ({ id: 'l', product: 'P', title: 'Test item', price, condition: 'good', sellerId: 's', city: 'Bengaluru', deliveryFee: 100, postedDaysAgo: 1, notes: '' });
const req = (budget = 18000, target = 16500, maxRounds = 5) => ({ product: 'P', budget, targetPrice: target, maxRounds, city: 'Bengaluru' });

test('clampOffer: never lets an offer exceed the budget', () => {
  assert.equal(E.clampOffer(20000, 18000).amount, 18000);
  assert.equal(E.clampOffer(20000, 18000).clamped, true);
  assert.equal(E.clampOffer(15000, 18000).amount, 15000);
  assert.equal(E.clampOffer(15000, 18000).clamped, false);
  assert.equal(E.clampOffer(18000, 18000).amount, 18000);
  assert.equal(E.clampOffer(-5, 18000).amount, 0);
  assert.equal(E.clampOffer(NaN, 18000).amount, 0);
});

test('canAccept: only at or under target + 5%', () => {
  assert.equal(E.canAccept(17325, 16500), true);   // exactly +5%
  assert.equal(E.canAccept(17326, 16500), false);
  assert.equal(E.canAccept(16500, 16500), true);
  assert.equal(E.canAccept(16000, 16500), true);
});

test('buyerOffer: ladder rises toward budget and never exceeds it', () => {
  const r = req(18000, 16500, 5);
  assert.deepEqual([1, 2, 3, 4, 5].map(n => E.buyerOffer(16500, 18000, n, 5)), [16500, 16875, 17250, 17625, 18000]);
  for (let n = 1; n <= 5; n++) assert.ok(E.buyerOffer(16500, 18000, n, 5) <= 18000);
  assert.equal(E.buyerOffer(16500, 18000, 1, 1), 16500);
});

test('sellerCounter: moves down by persona step, never below reservation', () => {
  assert.equal(E.sellerCounter(seller('firm', 18500), listing(21000), 21000, 1), 20800);
  assert.equal(E.sellerCounter(seller('flexible', 16400), listing(19500), 17000, 2), 16400); // clamps at reservation
  assert.equal(E.sellerCounter(seller('flexible', 16400), listing(19500), 16400, 3), 16400);
  assert.equal(E.sellerCounter(seller('slow', 17200), listing(18900), 18900, 1), null); // slow seller silent round 1
  assert.equal(E.sellerCounter(seller('slow', 17200), listing(18900), 18900, 2), 18550);
});

test('full negotiation: flexible seller accepts under budget (seeded XM5 case)', () => {
  const s = D.sellerById('s1'), l = D.listingById('l1'), r = req();
  const neg = E.newNegotiation(l, s, r);
  for (let i = 0; i < 5 && !neg.outcome; i++) E.runRound(neg, l, s, r, null);
  assert.equal(neg.outcome, 'accepted');
  assert.equal(neg.finalPrice, 17100);
  assert.ok(neg.finalPrice <= r.budget);
  assert.ok(E.canAccept(neg.finalPrice, r.targetPrice));
  const sum = E.dealSummary(neg, l);
  assert.equal(sum.saved, 19500 - 17100);
  assert.equal(sum.roundsUsed, 4);
});

test('full negotiation: firm seller never reaches the accept limit, walks away', () => {
  const s = D.sellerById('s2'), l = D.listingById('l2'), r = req();
  const neg = E.newNegotiation(l, s, r);
  for (let i = 0; i < 5 && !neg.outcome; i++) E.runRound(neg, l, s, r, null);
  assert.equal(neg.outcome, 'walked_away');
  assert.equal(neg.finalPrice, null);
  assert.equal(neg.round, 5);
  assert.ok(neg.offers.filter(o => o.by === 'buyer').every(o => o.amount <= r.budget));
});

test('full negotiation: slow seller walks away when the best price is above the accept limit', () => {
  const s = D.sellerById('s3'), l = D.listingById('l3'), r = req();
  const neg = E.newNegotiation(l, s, r);
  for (let i = 0; i < 5 && !neg.outcome; i++) E.runRound(neg, l, s, r, null);
  assert.equal(neg.outcome, 'walked_away');
  assert.equal(neg.state, 'walked_away');
});

test('manualAccept: blocked above target + 5%, allowed inside it', () => {
  const s = seller('firm', 18000), l = listing(20000), r = req();
  const neg = E.newNegotiation(l, s, r);
  neg.lastSeller = 18000; // above 17325 accept limit
  assert.equal(E.manualAccept(neg, r).ok, false);
  assert.equal(neg.outcome, null);
  neg.lastSeller = 17000;
  assert.equal(E.manualAccept(neg, r).ok, true);
  assert.equal(neg.outcome, 'accepted');
  assert.equal(neg.finalPrice, 17000);
});

test('manualCounter: above-budget counter is clamped and logged', () => {
  const s = seller('flexible', 15000), l = listing(19000), r = req();
  const neg = E.newNegotiation(l, s, r);
  const res = E.manualCounter(neg, 25000, r);
  assert.equal(res.ok, true);
  assert.equal(res.amount, 18000);
  assert.equal(res.clamped, true);
  assert.ok(neg.guardrailLog.some(x => x.includes('clamped')));
  assert.equal(E.manualCounter(neg, 0, r).ok, false);
});

test('walkAway: ends the negotiation immediately', () => {
  const neg = E.newNegotiation(listing(19000), seller('firm', 18000), req());
  E.walkAway(neg);
  assert.equal(neg.outcome, 'walked_away');
  assert.equal(neg.state, 'walked_away');
});

test('ranking: cheapest total cost with the best rating scores first; score is 0-100', () => {
  const ranked = E.rankListings(D.LISTINGS.filter(l => l.product === 'Sony WH-1000XM5'), l => D.sellerById(l.sellerId).rating);
  assert.equal(ranked.length, 6);
  assert.ok(ranked.every(x => x.score >= 0 && x.score <= 100));
  for (let i = 1; i < ranked.length; i++) assert.ok(ranked[i - 1].score >= ranked[i].score);
  assert.equal(ranked[0].listing.id, 'l1'); // best total cost + strong rating
  assert.equal(E.rankListings([]).length, 0);
});

test('scoreListing: price, condition, rating and delivery all move the score', () => {
  const cheap = { price: 10000, condition: 'new', rating: 5, deliveryFee: 0 };
  const dear = { price: 20000, condition: 'fair', rating: 3, deliveryFee: 500 };
  assert.ok(E.scoreListing(cheap, 10000, 500).score > E.scoreListing(dear, 10000, 500).score);
  assert.equal(E.totalCost({ price: 10000, deliveryFee: 250 }), 10250);
});

test('Gemini reply parsing: JSON wins, plain-text price extracted, clamped to reservation', () => {
  const l = listing(19500);
  let p = E.parseGeminiReply('{"message": "I can do this.", "counterPrice": 17500}', l, 16400);
  assert.equal(p.counterPrice, 17500);
  assert.equal(p.message, 'I can do this.');
  p = E.parseGeminiReply('{"message": "Deal?", "counterPrice": 15000}', l, 16400);
  assert.equal(p.counterPrice, 16400); // clamped up to reservation
  p = E.parseGeminiReply('Sure, I can do ₹17,800 for you.', l, 16400);
  assert.equal(p.counterPrice, 17800);
  p = E.parseGeminiReply('Let me think about it.', l, 16400);
  assert.equal(p.counterPrice, null);
  assert.equal(E.parseGeminiReply('', l, 16400), null);
  assert.equal(E.parseGeminiReply(null, l, 16400), null);
});

test('Gemini seller reply: a low AI counter is clamped to reservation, deal still closes honestly', () => {
  const s = D.sellerById('s1'), l = D.listingById('l1'), r = req();
  const neg = E.newNegotiation(l, s, r);
  E.runRound(neg, l, s, r, { message: 'Take it for ₹10,000!', counterPrice: 10000 });
  assert.equal(neg.lastSeller, 16400); // reservation price, not the AI's ₹10,000
});

test('seed data: 15 listings, 3 products, every listing has a seller with a reservation below asking', () => {
  assert.equal(D.LISTINGS.length, 15);
  assert.equal(D.PRODUCTS.length, 3);
  for (const l of D.LISTINGS) {
    const s = D.sellerById(l.sellerId);
    assert.ok(s, 'listing ' + l.id + ' has a seller');
    assert.ok(s.reservationPrice < l.price, 'reservation below asking for ' + l.id);
    assert.ok(s.reservationPrice > 0);
    assert.ok(['firm', 'flexible', 'slow'].includes(s.persona));
  }
});

test('dealSummary: null when no deal, correct savings when accepted', () => {
  const neg = E.newNegotiation(listing(20000), seller('firm', 18000), req());
  assert.equal(E.dealSummary(neg, listing(20000)), null);
  neg.outcome = 'accepted'; neg.finalPrice = 17000; neg.round = 3;
  const sum = E.dealSummary(neg, listing(20000));
  assert.equal(sum.saved, 3000);
  assert.equal(sum.savedPct, 15);
});
