'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_CONFIG,
  searchWindow,
  normalizeCheapFlightsConfig,
  compareTickets,
  buildSnapshot,
  isCheapFlightsActorAllowed,
  validAviasalesLink,
} = require('../api/cheap-flights.cjs');

function ticket(overrides = {}) {
  return {
    id: 'AYT:2026-10-30:2026-11-08:TK:30000:0:0',
    countryId: 'turkey',
    country: 'Турция',
    city: 'Анталия',
    destination: 'AYT',
    origin: 'LED',
    price: 30000,
    currency: 'rub',
    departureAt: '2026-10-30T08:00:00+03:00',
    returnAt: '2026-11-08T20:00:00+03:00',
    departureDate: '2026-10-30',
    returnDate: '2026-11-08',
    airline: 'TK',
    airlineName: 'Turkish Airlines',
    transfers: 0,
    returnTransfers: 0,
    maxTransfers: 0,
    direct: true,
    link: 'https://www.aviasales.ru/LED3010AYT0811',
    ...overrides,
  };
}

test('search window is exactly 30-60 days from Moscow date', () => {
  const result = searchWindow(new Date('2026-09-28T03:00:00Z'), DEFAULT_CONFIG);
  assert.deepEqual(result, { from: '2026-10-28', to: '2026-11-27' });
});

test('default access is only for Rustam', () => {
  const config = normalizeCheapFlightsConfig(DEFAULT_CONFIG);
  assert.equal(isCheapFlightsActorAllowed('Рустам', config), true);
  assert.equal(isCheapFlightsActorAllowed('Диана', config), false);
});

test('direct flights are preferred to a cheaper one-stop option', () => {
  const direct = ticket({ id: 'direct', price: 35000, maxTransfers: 0, transfers: 0, returnTransfers: 0 });
  const stop = ticket({ id: 'stop', price: 28000, maxTransfers: 1, transfers: 1, returnTransfers: 1 });
  assert.ok(compareTickets(direct, stop, DEFAULT_CONFIG) < 0);
});

test('snapshot contains top 3 plus one best row for every configured country', () => {
  const rows = [
    ticket({ id: 'tr', countryId: 'turkey', country: 'Турция', city: 'Анталия', destination: 'AYT', price: 30000 }),
    ticket({ id: 'eg', countryId: 'egypt', country: 'Египет', city: 'Шарм-эль-Шейх', destination: 'SSH', price: 32000 }),
    ticket({ id: 'th', countryId: 'thailand', country: 'Таиланд', city: 'Пхукет', destination: 'HKT', price: 65000 }),
    ticket({ id: 'ba', countryId: 'bali', country: 'Бали', city: 'Денпасар', destination: 'DPS', price: 70000 }),
    ticket({ id: 'bj', countryId: 'china', country: 'Китай', city: 'Пекин', destination: 'BJS', price: 48000 }),
    ticket({ id: 'sh', countryId: 'china', country: 'Китай', city: 'Шанхай', destination: 'SHA', price: 51000 }),
  ];
  const snapshot = buildSnapshot(rows, DEFAULT_CONFIG, null, new Date('2026-09-28T03:00:00Z'));
  assert.equal(snapshot.top.length, 3);
  assert.equal(snapshot.countries.length, 5);
  assert.equal(snapshot.countries.find((row) => row.countryId === 'china').city, 'Пекин');
});

test('snapshot compares displayed prices with previous daily snapshot', () => {
  const previous = {
    routePrices: { AYT: { price: 34000, destination: 'AYT' } },
    countryPrices: { turkey: { price: 34000, destination: 'AYT' } },
  };
  const snapshot = buildSnapshot([ticket({ price: 30000 })], DEFAULT_CONFIG, previous, new Date('2026-09-28T03:00:00Z'));
  assert.equal(snapshot.top[0].delta, -4000);
  assert.equal(snapshot.countries[0].delta, -4000);
});

test('only Aviasales purchase links are accepted', () => {
  assert.equal(validAviasalesLink('/LED3010AYT0811'), 'https://www.aviasales.ru/LED3010AYT0811');
  assert.equal(validAviasalesLink('https://www.aviasales.ru/search/LED'), 'https://www.aviasales.ru/search/LED');
  assert.equal(validAviasalesLink('https://example.com/ticket'), '');
});

test('home block is hidden by default and wired after market ticker', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');
  const app = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf8');
  assert.match(html, /id="cheapFlightsTile"[\s\S]*data-home-tile="cheap-flights"[\s\S]*hidden/);
  assert.ok(html.indexOf('id="cheapFlightsTile"') > html.indexOf('id="marketTickerTile"'));
  assert.match(app, /'markets','cheap-flights'/);
  assert.match(app, /cheapFlightsVisibleForActor/);
});

test('06:00 Moscow cron is reused instead of adding a new flight cron', () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  assert.ok(vercel.crons.some((row) => row.path === '/api/feed-notify-cron' && row.schedule === '0 3 * * *'));
  assert.equal(vercel.crons.some((row) => /flight/i.test(row.path)), false);
});
