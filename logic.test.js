// Run: node tests/logic.test.js
const assert = require('assert');
const U = require('../js/utils.js');
const A = require('../js/analytics.js');
let n = 0; const t = (name, fn) => { fn(); n++; console.log('ok -', name); };

t('round2 avoids float errors', () => { assert.strictEqual(U.round2(1.005), 1.01); assert.strictEqual(U.round2(0.1 + 0.2), 0.3); });
t('money format BD grouping', () => { assert.strictEqual(U.money(1234567.5), '৳12,34,567.50'); assert.strictEqual(U.money(0), '৳0.00'); assert.strictEqual(U.money(-250), '-৳250.00'); });
t('validMoney rules', () => {
  assert.ok(!U.validMoney('-5', 'x').ok); assert.ok(!U.validMoney('abc', 'x').ok); assert.ok(!U.validMoney('0', 'x').ok);
  assert.ok(U.validMoney('0', 'x', { allowZero: true }).ok); assert.ok(!U.validMoney('1.234', 'x').ok); assert.strictEqual(U.validMoney('1,250.50', 'x').value, 1250.5);
});
t('validQty rules', () => { assert.ok(!U.validQty('-1', 'q').ok); assert.ok(!U.validQty('0', 'q').ok); assert.ok(U.validQty('2.5', 'q').ok); assert.ok(!U.validQty('1.2345', 'q').ok); });
t('dates', () => {
  assert.ok(U.isValidDate('2026-02-28')); assert.ok(!U.isValidDate('2026-02-30')); assert.ok(!U.isValidDate('26-1-1'));
  assert.strictEqual(U.weekStart('2026-11-24'), '2026-11-23'); assert.strictEqual(U.addDays('2026-12-31', 1), '2027-01-01');
});
t('esc prevents HTML injection', () => { assert.strictEqual(U.esc('<img onerror="x">'), '&lt;img onerror=&quot;x&quot;&gt;'); });
t('checksum stable & sensitive', () => { assert.strictEqual(U.checksum('abc'), U.checksum('abc')); assert.notStrictEqual(U.checksum('abc'), U.checksum('abd')); });

const data = {
  products: [
    { id: 1, name: 'Panel', qty: 4, costPrice: 10000, sellPrice: 12000, lowStock: 5, archived: false },
    { id: 2, name: 'LED', qty: 100, costPrice: 50.5, sellPrice: 80, lowStock: 10, archived: false },
    { id: 3, name: 'Old', qty: 0, costPrice: 5, sellPrice: 9, lowStock: 2, archived: false },
  ],
  sales: [
    { id: 1, invoiceNo: 'INV-00001', date: '2026-11-24', total: 24000, profit: 4000, paid: 20000, due: 4000, createdAt: '2026-11-24T05:00:00Z', items: [{ productId: 1, name: 'Panel', qty: 2, lineTotal: 24000, lineProfit: 4000 }] },
    { id: 2, invoiceNo: 'INV-00002', date: '2026-11-10', total: 800, profit: 295, paid: 800, due: 0, createdAt: '2026-11-10T05:00:00Z', items: [{ productId: 2, name: 'LED', qty: 10, lineTotal: 800, lineProfit: 295 }] },
    { id: 3, invoiceNo: 'INV-00003', date: '2026-10-05', total: 160, profit: 59, paid: 160, due: 0, createdAt: '2026-10-05T05:00:00Z', items: [{ productId: 2, name: 'LED', qty: 2, lineTotal: 160, lineProfit: 59 }] },
  ],
  expenses: [{ id: 1, date: '2026-11-12', category: 'Electricity', amount: 1500 }, { id: 2, date: '2026-10-12', category: 'Shop rent', amount: 100 }],
};
t('inventory value & dues', () => { assert.strictEqual(A.inventoryValue(data.products), 45050); assert.strictEqual(A.totalDues(data.sales), 4000); });
t('low stock alerts', () => { const l = A.lowStock(data.products); assert.deepStrictEqual(l.map((p) => p.name), ['Old', 'Panel']); });
t('dashboard numbers come from records', () => {
  const d = A.dashboard(data, '2026-11-24');
  assert.strictEqual(d.todaySales, 24000); assert.strictEqual(d.todayGross, 4000);
  assert.strictEqual(d.month.sales, 24800); assert.strictEqual(d.month.gross, 4295); assert.strictEqual(d.month.expenses, 1500); assert.strictEqual(d.month.net, 2795);
  assert.strictEqual(d.series.length, 6); assert.strictEqual(d.series[5].key, '2026-11'); assert.strictEqual(d.series[4].sales, 160); assert.strictEqual(d.series[4].net, -41);
  assert.strictEqual(d.bestSelling[0].name, 'LED'); assert.strictEqual(d.recent[0].invoiceNo, 'INV-00001');
});
t('net profit = gross - expenses (never confused)', () => { const x = A.totals(data, '2026-11-01', '2026-11-30'); assert.strictEqual(x.net, x.gross - x.expenses); assert.notStrictEqual(x.net, x.gross); });
t('report grouping + comparison', () => {
  const r = A.report(data, '2026-11-01', '2026-11-30', 'week');
  assert.strictEqual(r.rows.reduce((a, x) => a + x.sales, 0), 24800); assert.strictEqual(r.totals.sales, 24800);
  assert.deepStrictEqual(r.prevRange, ['2026-10-02', '2026-10-31']); assert.strictEqual(r.previous.sales, 160);
  assert.strictEqual(A.report(data, '2026-01-01', '2026-12-31', 'month').rows.length, 2);
  assert.strictEqual(r.mostProfitable[0].name, 'Panel'); assert.strictEqual(r.expenseByCategory[0].category, 'Electricity');
});
console.log('\nAll ' + n + ' logic tests passed');
