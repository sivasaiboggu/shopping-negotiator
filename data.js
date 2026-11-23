// Seeded simulated marketplace. Fixed demo data — labelled as seeded in the UI.
// Reservation prices are hidden from the UI; the engine uses them, the user never sees them.
(function (root) {
  'use strict';
  var SELLERS = [
    { id: 's1', name: 'Arun Traders', rating: 4.8, dealsDone: 214, persona: 'flexible', reservationPrice: 16400, city: 'Bengaluru' },
    { id: 's2', name: 'Meera K.', rating: 4.6, dealsDone: 87, persona: 'firm', reservationPrice: 18500, city: 'Bengaluru' },
    { id: 's3', name: 'City Gadgets', rating: 4.2, dealsDone: 430, persona: 'slow', reservationPrice: 17200, city: 'Mumbai' },
    { id: 's4', name: 'Rahul S.', rating: 3.1, dealsDone: 12, persona: 'firm', reservationPrice: 17800, city: 'Delhi' },
    { id: 's5', name: 'TechNest', rating: 4.9, dealsDone: 640, persona: 'flexible', reservationPrice: 15900, city: 'Bengaluru' },
    { id: 's6', name: 'Kavya R.', rating: 4.4, dealsDone: 56, persona: 'slow', reservationPrice: 18100, city: 'Hyderabad' },
    { id: 'g1', name: 'GPU Hub', rating: 4.7, dealsDone: 310, persona: 'flexible', reservationPrice: 24800, city: 'Bengaluru' },
    { id: 'g2', name: 'Vikram P.', rating: 4.5, dealsDone: 98, persona: 'firm', reservationPrice: 28900, city: 'Mumbai' },
    { id: 'g3', name: 'Pixel Store', rating: 4.1, dealsDone: 175, persona: 'slow', reservationPrice: 26200, city: 'Delhi' },
    { id: 'g4', name: 'Nikhil D.', rating: 4.3, dealsDone: 44, persona: 'flexible', reservationPrice: 23400, city: 'Chennai' },
    { id: 'g5', name: 'BuildRight', rating: 4.8, dealsDone: 520, persona: 'firm', reservationPrice: 29600, city: 'Bengaluru' },
    { id: 'b1', name: 'Cycle Point', rating: 4.6, dealsDone: 190, persona: 'flexible', reservationPrice: 9200, city: 'Bengaluru' },
    { id: 'b2', name: 'Anil Kumar', rating: 4.0, dealsDone: 33, persona: 'firm', reservationPrice: 11800, city: 'Hyderabad' },
    { id: 'b3', name: 'Pedal Works', rating: 4.5, dealsDone: 88, persona: 'slow', reservationPrice: 10100, city: 'Mumbai' },
    { id: 'b4', name: 'Sana F.', rating: 4.7, dealsDone: 61, persona: 'flexible', reservationPrice: 8600, city: 'Chennai' }
  ];
  var LISTINGS = [
    { id: 'l1', product: 'Sony WH-1000XM5', title: 'Sony WH-1000XM5 — black, with case', price: 19500, condition: 'like-new', sellerId: 's1', city: 'Bengaluru', deliveryFee: 0, postedDaysAgo: 2, notes: 'Bought Mar 2026, bill + warranty available.' },
    { id: 'l2', product: 'Sony WH-1000XM5', title: 'Sony WH-1000XM5 — silver, barely used', price: 21000, condition: 'like-new', sellerId: 's2', city: 'Bengaluru', deliveryFee: 150, postedDaysAgo: 1, notes: 'Used twice, selling as I got the XM6.' },
    { id: 'l3', product: 'Sony WH-1000XM5', title: 'Sony WH-1000XM5 — black, open box', price: 18900, condition: 'good', sellerId: 's3', city: 'Mumbai', deliveryFee: 250, postedDaysAgo: 4, notes: 'Open box, full kit. Ships in 2 days.' },
    { id: 'l4', product: 'Sony WH-1000XM5', title: 'Sony WH-1000XM5 — black', price: 18500, condition: 'good', sellerId: 's4', city: 'Delhi', deliveryFee: 300, postedDaysAgo: 6, notes: 'Works fine, no bill.' },
    { id: 'l5', product: 'Sony WH-1000XM5', title: 'Sony WH-1000XM5 — black, sealed box', price: 22500, condition: 'new', sellerId: 's5', city: 'Bengaluru', deliveryFee: 0, postedDaysAgo: 1, notes: 'Sealed, GST bill on request.' },
    { id: 'l6', product: 'Sony WH-1000XM5', title: 'Sony WH-1000XM5 — midnight blue', price: 19900, condition: 'good', sellerId: 's6', city: 'Hyderabad', deliveryFee: 200, postedDaysAgo: 3, notes: 'Light use, ear pads replaced.' },
    { id: 'l7', product: 'NVIDIA RTX 4060 8GB', title: 'RTX 4060 8GB — Zotac Twin Edge', price: 30500, condition: 'like-new', sellerId: 'g1', city: 'Bengaluru', deliveryFee: 0, postedDaysAgo: 2, notes: 'Under warranty till Dec 2027.' },
    { id: 'l8', product: 'NVIDIA RTX 4060 8GB', title: 'RTX 4060 8GB — Gigabyte OC', price: 31900, condition: 'good', sellerId: 'g2', city: 'Mumbai', deliveryFee: 200, postedDaysAgo: 5, notes: 'Never mined, used for gaming only.' },
    { id: 'l9', product: 'NVIDIA RTX 4060 8GB', title: 'RTX 4060 8GB — MSI Ventus 2X', price: 28900, condition: 'good', sellerId: 'g3', city: 'Delhi', deliveryFee: 250, postedDaysAgo: 3, notes: 'Box + bill available.' },
    { id: 'l10', product: 'NVIDIA RTX 4060 8GB', title: 'RTX 4060 8GB — Asus Dual', price: 27900, condition: 'fair', sellerId: 'g4', city: 'Chennai', deliveryFee: 300, postedDaysAgo: 7, notes: 'Fan noise at load, priced accordingly.' },
    { id: 'l11', product: 'NVIDIA RTX 4060 8GB', title: 'RTX 4060 8GB — Zotac, sealed', price: 33400, condition: 'new', sellerId: 'g5', city: 'Bengaluru', deliveryFee: 0, postedDaysAgo: 1, notes: 'Sealed unit, bill included.' },
    { id: 'l12', product: 'Firefox Target 26" cycle', title: 'Firefox Target 26" — 21 gear', price: 12400, condition: 'like-new', sellerId: 'b1', city: 'Bengaluru', deliveryFee: 0, postedDaysAgo: 2, notes: 'Ridden under 200 km.' },
    { id: 'l13', product: 'Firefox Target 26" cycle', title: 'Firefox Target 26" — single speed', price: 11900, condition: 'good', sellerId: 'b2', city: 'Hyderabad', deliveryFee: 200, postedDaysAgo: 4, notes: 'New tyres fitted last month.' },
    { id: 'l14', product: 'Firefox Target 26" cycle', title: 'Firefox Target 26" — 21 gear', price: 11200, condition: 'good', sellerId: 'b3', city: 'Mumbai', deliveryFee: 250, postedDaysAgo: 5, notes: 'Serviced, ready to ride.' },
    { id: 'l15', product: 'Firefox Target 26" cycle', title: 'Firefox Target 26" — 18 gear', price: 10800, condition: 'fair', sellerId: 'b4', city: 'Chennai', deliveryFee: 150, postedDaysAgo: 6, notes: 'Some rust on chain, works fine.' }
  ];
  var PRODUCTS = ['Sony WH-1000XM5', 'NVIDIA RTX 4060 8GB', 'Firefox Target 26" cycle'];
  var CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Hyderabad', 'Chennai'];
  var api = {
    SELLERS: SELLERS, LISTINGS: LISTINGS, PRODUCTS: PRODUCTS, CITIES: CITIES,
    sellerById: function (id) { return SELLERS.find(function (s) { return s.id === id; }); },
    listingById: function (id) { return LISTINGS.find(function (l) { return l.id === id; }); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.SeedData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
