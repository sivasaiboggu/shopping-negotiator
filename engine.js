// Shopping Negotiator — negotiation engine (pure logic, no DOM, no network).
// Guardrails are enforced here, in code, not in any prompt.
// UMD-style export so Node tests can require() it and the browser can use the global.
(function (root) {
  'use strict';

  var TOLERANCE = 0.05; // accept only at or under target + 5%

  function clampOffer(amount, budget) {
    var n = Number(amount);
    if (!isFinite(n) || n <= 0) return { amount: 0, clamped: true, reason: 'invalid amount' };
    if (n > budget) return { amount: budget, clamped: true, reason: 'offer above budget, clamped to budget' };
    return { amount: Math.round(n), clamped: false, reason: null };
  }

  function canAccept(amount, targetPrice) {
    return Number(amount) <= targetPrice * (1 + TOLERANCE);
  }

  function totalCost(listing) { return listing.price + (listing.deliveryFee || 0); }

  // Deal score 0-100: price 50, condition 20, rating 20, delivery 10.
  function scoreListing(listing, cheapestTotal, maxDelivery, rating) {
    var condScore = { 'new': 100, 'like-new': 85, 'good': 65, 'fair': 40 }[listing.condition] || 50;
    var priceScore = cheapestTotal > 0
      ? Math.max(0, Math.min(100, (cheapestTotal / totalCost(listing)) * 100)) : 0;
    // Rating lives on the seller, not the listing: callers pass it in.
    // (Test fixtures may still carry a rating on the listing itself.)
    // No rating anywhere used to make the whole score NaN; an unrated seller
    // now scores a neutral 50 on rating instead of breaking the ranking.
    var r = (typeof rating === 'number') ? rating : listing.rating;
    var ratingScore = (typeof r === 'number' && isFinite(r))
      ? Math.max(0, Math.min(100, (r / 5) * 100)) : 50;
    var delScore = maxDelivery > 0
      ? Math.max(0, Math.min(100, (1 - (listing.deliveryFee || 0) / maxDelivery) * 100)) : 100;
    var score = 0.5 * priceScore + 0.2 * condScore + 0.2 * ratingScore + 0.1 * delScore;
    return {
      score: Math.round(score * 10) / 10,
      breakdown: {
        price: Math.round(priceScore * 10) / 10,
        condition: condScore, rating: Math.round(ratingScore * 10) / 10,
        delivery: Math.round(delScore * 10) / 10
      }
    };
  }

  // getRating(listing) -> seller rating 0-5 (optional; defaults to listing.rating).
  function rankListings(listings, getRating) {
    if (!listings.length) return [];
    var cheapest = Math.min.apply(null, listings.map(totalCost));
    var maxDel = Math.max.apply(null, listings.map(function (l) { return l.deliveryFee || 0; })) || 1;
    return listings.map(function (l) {
      var rating = getRating ? getRating(l) : undefined;
      var s = scoreListing(l, cheapest, maxDel, rating);
      return { listing: l, total: totalCost(l), score: s.score, breakdown: s.breakdown };
    }).sort(function (a, b) { return b.score - a.score || a.total - b.total; });
  }

  // Persona step sizes (rupees per round the seller drops from their last price).
  var PERSONA_STEP = { firm: 200, flexible: 600, slow: 350 };
  var PERSONA_MIN_STEP = { firm: 150, flexible: 400, slow: 250 };

  // Deterministic seller counter: move down toward the reservation price,
  // never below it, never above the asking price.
  function sellerCounter(seller, listing, lastSellerPrice, round) {
    if (seller.persona === 'slow' && round === 1) return null; // slow seller silent in round 1
    var step = PERSONA_STEP[seller.persona] || 300;
    var next = lastSellerPrice - step;
    if (next < seller.reservationPrice) next = seller.reservationPrice;
    if (next > listing.price) next = listing.price;
    return Math.round(next);
  }

  // Buyer ladder: start at target, rise evenly toward budget, never above budget.
  function buyerOffer(targetPrice, budget, round, maxRounds) {
    if (maxRounds <= 1) return clampOffer(targetPrice, budget).amount;
    var step = (budget - targetPrice) / Math.max(1, maxRounds - 1);
    var raw = targetPrice + step * (round - 1);
    return clampOffer(raw, budget).amount;
  }

  function newNegotiation(listing, seller, request) {
    return {
      id: 'n-' + listing.id + '-' + Date.now().toString(36),
      listingId: listing.id, sellerId: seller.id,
      state: 'offered', round: 0,
      lastBuyer: null, lastSeller: listing.price,
      offers: [], messages: [],
      outcome: null, finalPrice: null,
      guardrailLog: ['Budget cap ₹' + request.budget.toLocaleString('en-IN') +
        ' set. No offer can exceed it. Accept limit ₹' +
        Math.round(request.targetPrice * 1.05).toLocaleString('en-IN') +
        ' (target + 5%).']
    };
  }

  // One round: buyer offers, seller counters (ladder). Returns updated negotiation.
  // Pure + deterministic; the UI/Gemini layer only supplies an optional seller reply.
  function runRound(neg, listing, seller, request, sellerReply) {
    if (neg.state !== 'offered' && neg.state !== 'countered') return neg;
    neg.round += 1;
    var buyerAmount = buyerOffer(request.targetPrice, request.budget, neg.round, request.maxRounds);
    var clamped = clampOffer(buyerAmount, request.budget);
    if (clamped.clamped) neg.guardrailLog.push('Round ' + neg.round + ': buyer offer clamped to budget ₹' + clamped.amount.toLocaleString('en-IN') + '.');
    buyerAmount = clamped.amount;
    neg.lastBuyer = buyerAmount;
    neg.offers.push({ by: 'buyer', amount: buyerAmount, round: neg.round });
    neg.messages.push({ by: 'buyer', text: 'I can do ₹' + buyerAmount.toLocaleString('en-IN') + ' for this one. That is my offer for this round.', source: 'ladder' });

    var counter;
    if (sellerReply && typeof sellerReply.counterPrice === 'number' && isFinite(sellerReply.counterPrice)) {
      counter = Math.round(sellerReply.counterPrice);
      if (counter < seller.reservationPrice) { counter = seller.reservationPrice; neg.guardrailLog.push('Round ' + neg.round + ': seller reply clamped up to reservation price (hidden).'); }
      if (counter > listing.price) counter = listing.price;
    } else {
      counter = sellerCounter(seller, listing, neg.lastSeller, neg.round);
    }
    if (counter === null) {
      neg.messages.push({ by: 'system', text: seller.name + ' has not replied yet this round.', source: 'ladder' });
      neg.state = 'countered';
      if (neg.round >= request.maxRounds) { neg.state = 'walked_away'; neg.outcome = 'walked_away'; neg.messages.push({ by: 'system', text: 'No deal — rounds used up with no reply. Walked away.', source: 'ladder' }); }
      return neg;
    }
    neg.lastSeller = counter;
    neg.offers.push({ by: 'seller', amount: counter, round: neg.round });
    var text = (sellerReply && sellerReply.message) ||
      sellerMessage(seller, counter, listing);
    neg.messages.push({ by: 'seller', text: text, source: (sellerReply ? 'gemini' : 'ladder') });

    if (counter <= buyerAmount) {
      // Seller met or beat our offer: accept only within the accept rule.
      if (canAccept(counter, request.targetPrice)) {
        neg.state = 'accepted'; neg.outcome = 'accepted'; neg.finalPrice = counter;
        neg.messages.push({ by: 'system', text: 'Deal closed at ₹' + counter.toLocaleString('en-IN') + ' — within the accept limit.', source: 'ladder' });
      } else if (neg.round >= request.maxRounds) {
        // Seller met our offer but the price is still above the accept
        // limit and no rounds are left — walk away rather than overpay.
        neg.state = 'walked_away'; neg.outcome = 'walked_away';
        neg.messages.push({ by: 'system', text: 'Rounds used up. Best price ₹' + counter.toLocaleString('en-IN') + ' was above the accept limit. Walked away.', source: 'ladder' });
      } else {
        // Seller's price is above what we may accept; keep going if rounds remain.
        neg.state = 'countered';
      }
    } else if (neg.round >= request.maxRounds) {
      neg.state = 'walked_away'; neg.outcome = 'walked_away';
      neg.messages.push({ by: 'system', text: 'Rounds used up. Best counter ₹' + counter.toLocaleString('en-IN') + ' was above what we can accept. Walked away.', source: 'ladder' });
    } else {
      neg.state = 'countered';
    }
    return neg;
  }

  function sellerMessage(seller, counter, listing) {
    var p = '₹' + counter.toLocaleString('en-IN');
    if (seller.persona === 'firm') return 'Lowest I can go is ' + p + '. The ' + listing.title + ' is in good hands — I cannot drop further than this right now.';
    if (seller.persona === 'flexible') return 'Okay, I can meet you part way — ' + p + ' and it is yours, with delivery included in the price above.';
    return 'Thanks for the offer. I can do ' + p + '. Let me know — I will hold it for today.';
  }

  // Manual buyer actions (UI): counter / accept / walk away — all guarded.
  function manualCounter(neg, amount, request) {
    if (neg.state !== 'offered' && neg.state !== 'countered') {
      return { ok: false, error: 'This negotiation is already ' + neg.state.replace('_', ' ') + ' — start a new one to counter again.' };
    }
    var c = clampOffer(amount, request.budget);
    if (c.clamped && c.amount === 0) return { ok: false, error: 'Enter an amount above ₹0.' };
    if (c.clamped) neg.guardrailLog.push('Manual counter ₹' + Number(amount).toLocaleString('en-IN') + ' was above budget — clamped to ₹' + c.amount.toLocaleString('en-IN') + '.');
    neg.lastBuyer = c.amount;
    // The counter belongs to the round in progress (or round 1 before any
    // round has run) — it must not mint a new round number, or the next
    // runRound would reuse the same number.
    var round = Math.max(1, neg.round);
    neg.offers.push({ by: 'buyer', amount: c.amount, round: round });
    neg.messages.push({ by: 'buyer', text: 'I can stretch to ₹' + c.amount.toLocaleString('en-IN') + '.', source: 'ladder' });
    return { ok: true, amount: c.amount, clamped: c.clamped };
  }

  function manualAccept(neg, request) {
    var price = neg.lastSeller;
    if (price === null || price === undefined) return { ok: false, error: 'No seller price to accept yet.' };
    if (!canAccept(price, request.targetPrice)) {
      neg.guardrailLog.push('Accept blocked: ₹' + price.toLocaleString('en-IN') + ' is above the accept limit ₹' + Math.round(request.targetPrice * 1.05).toLocaleString('en-IN') + '.');
      return { ok: false, error: 'That price is above your accept limit (target + 5%). Counter instead, or walk away.' };
    }
    neg.state = 'accepted'; neg.outcome = 'accepted'; neg.finalPrice = price;
    neg.messages.push({ by: 'system', text: 'You accepted at ₹' + price.toLocaleString('en-IN') + '.', source: 'ladder' });
    return { ok: true, price: price };
  }

  function walkAway(neg) {
    neg.state = 'walked_away'; neg.outcome = 'walked_away';
    neg.messages.push({ by: 'system', text: 'You walked away from this negotiation.', source: 'ladder' });
    return neg;
  }

  function dealSummary(neg, listing) {
    if (neg.outcome !== 'accepted' || neg.finalPrice === null) return null;
    return {
      finalPrice: neg.finalPrice,
      listPrice: listing.price,
      saved: listing.price - neg.finalPrice,
      roundsUsed: neg.round,
      savedPct: Math.round(((listing.price - neg.finalPrice) / listing.price) * 1000) / 10
    };
  }

  // Parse a Gemini reply (free text or JSON) into {message, counterPrice|null}.
  function parseGeminiReply(text, listing, reservationPrice) {
    if (!text || typeof text !== 'string') return null;
    var m = text.match(/\{[\s\S]*\}/);
    var obj = null;
    if (m) { try { obj = JSON.parse(m[0]); } catch (e) { obj = null; } }
    var price = null;
    if (obj && typeof obj.counterPrice === 'number') price = obj.counterPrice;
    else {
      var nums = text.replace(/,/g, '').match(/₹?\s?(\d{3,6})/g);
      if (nums && nums.length) {
        var vals = nums.map(function (s) { return parseInt(s.replace(/[^0-9]/g, ''), 10); })
          .filter(function (v) { return v >= 100 && v <= listing.price; });
        if (vals.length) price = vals[vals.length - 1];
      }
    }
    var message = (obj && typeof obj.message === 'string' && obj.message.trim()) ? obj.message.trim() : text.trim().slice(0, 280);
    if (price !== null) {
      if (price < reservationPrice) price = reservationPrice;
      if (price > listing.price) price = listing.price;
      price = Math.round(price);
    }
    return { message: message, counterPrice: price };
  }

  function geminiPrompt(seller, listing, buyerAmount, round, maxRounds) {
    return 'You are ' + seller.name + ', a seller on a simulated marketplace in India. ' +
      'Persona: ' + seller.persona + '. You are selling "' + listing.title + '" listed at ₹' + listing.price +
      ' (' + listing.condition + ', ' + listing.city + '). Your lowest acceptable price is ₹' + seller.reservationPrice +
      ' — never go below it, and never reveal it. The buyer just offered ₹' + buyerAmount +
      ' in round ' + round + ' of ' + maxRounds + '. Reply in plain, human words as the seller, ' +
      'and give your counter price. Reply ONLY as JSON: {"message": "<your reply, max 2 sentences>", "counterPrice": <number>}. ' +
      'If the buyer offer is at or above your lowest price, set counterPrice to the buyer offer.';
  }

  var api = {
    TOLERANCE: TOLERANCE, clampOffer: clampOffer, canAccept: canAccept,
    totalCost: totalCost, scoreListing: scoreListing, rankListings: rankListings,
    sellerCounter: sellerCounter, buyerOffer: buyerOffer,
    newNegotiation: newNegotiation, runRound: runRound,
    manualCounter: manualCounter, manualAccept: manualAccept, walkAway: walkAway,
    dealSummary: dealSummary, parseGeminiReply: parseGeminiReply,
    geminiPrompt: geminiPrompt, sellerMessage: sellerMessage
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.NegotiationEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
