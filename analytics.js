/* analytics.js — pure functions over stored records (unit-tested in Node).
   data = { products, sales, expenses, payments, stockMovements } */
(function (root) {
  'use strict';
  const U = root.MZ && root.MZ.U ? root.MZ.U : require('./utils.js');
  const A = {};
  const sum = (arr, f) => U.round2(arr.reduce((t, x) => t + f(x), 0));

  A.inventoryValue = (products) => sum(products.filter((p) => p.qty > 0), (p) => p.qty * p.costPrice);
  A.totalDues = (sales) => sum(sales, (s) => s.due);
  A.lowStock = (products) => products
    .filter((p) => !p.archived && p.qty <= p.lowStock && p.lowStock > 0)
    .sort((a, b) => a.qty - b.qty);

  // Aggregate product performance from sale lines
  A.productStats = function (sales) {
    const m = {};
    sales.forEach(function (s) {
      s.items.forEach(function (it) {
        const r = m[it.productId] || (m[it.productId] = { productId: it.productId, name: it.name, qty: 0, revenue: 0, profit: 0 });
        r.qty += it.qty; r.revenue += it.lineTotal; r.profit += it.lineProfit;
      });
    });
    return Object.values(m).map((r) => ({ productId: r.productId, name: r.name, qty: Math.round(r.qty * 1000) / 1000, revenue: U.round2(r.revenue), profit: U.round2(r.profit) }));
  };
  A.bestSelling = (sales, n) => A.productStats(sales).sort((a, b) => b.qty - a.qty).slice(0, n || 5);
  A.mostProfitable = (sales, n) => A.productStats(sales).sort((a, b) => b.profit - a.profit).slice(0, n || 5);

  // Totals for a date range [from, to] inclusive
  A.totals = function (data, from, to) {
    const inR = (d) => d >= from && d <= to;
    const sales = data.sales.filter((s) => inR(s.date));
    const exps = data.expenses.filter((e) => inR(e.date));
    const salesTotal = sum(sales, (s) => s.total);
    const gross = sum(sales, (s) => s.profit);
    const expenses = sum(exps, (e) => e.amount);
    return { count: sales.length, sales: salesTotal, gross: gross, expenses: expenses, net: U.round2(gross - expenses), collected: sum(sales, (s) => s.paid), due: sum(sales, (s) => s.due) };
  };

  A.monthlySeries = function (data, endMonthKey, months) {
    const out = [];
    let y = Number(endMonthKey.slice(0, 4)), m = Number(endMonthKey.slice(5, 7));
    const keys = [];
    for (let i = 0; i < months; i++) {
      keys.unshift(y + '-' + String(m).padStart(2, '0'));
      m--; if (m === 0) { m = 12; y--; }
    }
    keys.forEach(function (k) {
      const t = A.totals(data, k + '-01', k + '-31');
      out.push({ key: k, label: U.monthLabel(k), sales: t.sales, gross: t.gross, expenses: t.expenses, net: t.net });
    });
    return out;
  };

  A.dashboard = function (data, today) {
    const t = A.totals(data, today, today);
    const mk = U.monthKey(today);
    const month = A.totals(data, mk + '-01', mk + '-31');
    const last30 = data.sales.filter((s) => s.date >= U.addDays(today, -29) && s.date <= today);
    return {
      todaySales: t.sales, todayGross: t.gross, todayCount: t.count,
      inventoryValue: A.inventoryValue(data.products),
      dues: A.totalDues(data.sales),
      bestSelling: A.bestSelling(last30, 5),
      recent: data.sales.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, 8),
      lowStock: A.lowStock(data.products),
      series: A.monthlySeries(data, mk, 6),
      month: month,
    };
  };

  // Group by day / week / month between from..to
  A.report = function (data, from, to, groupBy) {
    const keyOf = (d) => groupBy === 'month' ? U.monthKey(d) : groupBy === 'week' ? U.weekStart(d) : d;
    const buckets = {};
    const get = (k) => buckets[k] || (buckets[k] = { key: k, sales: 0, gross: 0, expenses: 0, count: 0 });
    data.sales.filter((s) => s.date >= from && s.date <= to).forEach(function (s) {
      const b = get(keyOf(s.date)); b.sales += s.total; b.gross += s.profit; b.count++;
    });
    data.expenses.filter((e) => e.date >= from && e.date <= to).forEach(function (e) { get(keyOf(e.date)).expenses += e.amount; });
    const rows = Object.values(buckets).sort((a, b) => (a.key < b.key ? -1 : 1)).map(function (b) {
      return { key: b.key, label: groupBy === 'month' ? U.monthLabel(b.key) : groupBy === 'week' ? 'Week of ' + U.formatDate(b.key) : U.formatDate(b.key),
        sales: U.round2(b.sales), gross: U.round2(b.gross), expenses: U.round2(b.expenses), net: U.round2(b.gross - b.expenses), count: b.count };
    });
    // previous period of the same length, for comparison
    const days = Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000) + 1;
    const prevTo = U.addDays(from, -1), prevFrom = U.addDays(from, -days);
    const rangeSales = data.sales.filter((s) => s.date >= from && s.date <= to);
    const expByCat = {};
    data.expenses.filter((e) => e.date >= from && e.date <= to).forEach((e) => { expByCat[e.category] = (expByCat[e.category] || 0) + e.amount; });
    return {
      rows: rows, totals: A.totals(data, from, to), previous: A.totals(data, prevFrom, prevTo), prevRange: [prevFrom, prevTo],
      bestSelling: A.bestSelling(rangeSales, 10), mostProfitable: A.mostProfitable(rangeSales, 10),
      expenseByCategory: Object.keys(expByCat).map((k) => ({ category: k, amount: U.round2(expByCat[k]) })).sort((a, b) => b.amount - a.amount),
    };
  };

  A.valuationRows = (products) => products.filter((p) => p.qty > 0)
    .map((p) => ({ id: p.id, name: p.name, category: p.category, qty: p.qty, unit: p.unit, cost: p.costPrice, value: U.round2(p.qty * p.costPrice), retail: U.round2(p.qty * p.sellPrice), archived: p.archived }))
    .sort((a, b) => b.value - a.value);

  root.MZ = root.MZ || {};
  root.MZ.Analytics = A;
  if (typeof module !== 'undefined' && module.exports) module.exports = A;
})(typeof window !== 'undefined' ? window : globalThis);
