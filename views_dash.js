/* views_dash.js — Dashboard and Reports screens. */
(function () {
  'use strict';
  const U = MZ.U, A = MZ.Analytics, DB = MZ.DB, { $, $$ } = MZ.UI;
  const V = (MZ.Views = MZ.Views || {});
  const e = U.esc, m = U.money;
  const tile = (lbl, val, sub, cls) => '<div class="tile ' + (cls || '') + '"><div class="lbl">' + lbl + '</div><div class="val">' + val + '</div>' + (sub ? '<div class="sub">' + sub + '</div>' : '') + '</div>';
  const signed = (n) => '<span class="' + (n < 0 ? 'neg' : 'pos') + '">' + m(n) + '</span>';

  V.dashboard = async function (el) {
    const data = await DB.loadAll();
    const d = A.dashboard(data, U.today());
    const last = await DB.getMeta('lastExport', null);
    const hasData = data.sales.length + data.products.length + data.expenses.length > 0;
    let banner = '';
    if (hasData) {
      const days = last ? Math.floor((Date.now() - new Date(last.at)) / 86400000) : null;
      if (days === null) banner = '<div class="banner">You have not made a backup yet. Go to <a href="#/backup">Backup</a> and save a copy of your records.</div>';
      else if (days >= 7) banner = '<div class="banner">Your last backup was ' + days + ' days ago. Please make a new one in <a href="#/backup">Backup</a>.</div>';
    }
    const empty = !hasData ? '<div class="banner info"><b>Welcome!</b> Start by adding your products in <a href="#/inventory">Stock</a>, then record sales in <a href="#/sales">Sales</a>. This page fills in automatically.</div>' : '';

    el.innerHTML =
      '<div class="page-head"><h2>Dashboard</h2><span class="muted small">' + e(U.formatDate(U.today())) + '</span></div>' + banner + empty +
      '<div class="grid tiles">' +
      tile("Today's sales", m(d.todaySales), d.todayCount + ' sale(s)') +
      tile("Today's gross profit", m(d.todayGross), 'Before expenses', 'blue') +
      tile('Stock value (at cost)', m(d.inventoryValue), 'What your stock cost you') +
      tile('Customer dues', m(d.dues), 'Money customers owe you', d.dues > 0 ? 'warn' : '') +
      '</div>' +
      '<div class="card"><h3>This month (' + e(U.monthLabel(U.monthKey(U.today()))) + ')</h3><div class="grid tiles">' +
      tile('Sales', m(d.month.sales)) + tile('Gross profit', m(d.month.gross), 'Sales profit before expenses', 'blue') +
      tile('Expenses', m(d.month.expenses)) + tile('Net profit', m(d.month.net), 'Gross profit − expenses', d.month.net < 0 ? 'warn' : '') +
      '</div></div>' +
      '<div class="card"><h3>Low-stock alerts</h3>' + (d.lowStock.length
        ? '<div class="scroll"><table><tbody>' + d.lowStock.map((p) => '<tr><td><b>' + e(p.name) + '</b></td><td class="num"><span class="badge low">' + U.qty(p.qty) + ' ' + e(p.unit) + ' left</span></td></tr>').join('') + '</tbody></table></div>'
        : '<p class="muted">No products are running low.</p>') + '</div>' +
      '<div class="card"><h3>Monthly sales &amp; profit (last 6 months)</h3><canvas class="chart" id="chMonthly" role="img" aria-label="Monthly sales and gross profit chart"></canvas></div>' +
      '<div class="card"><h3>Monthly profit summary</h3><div class="scroll"><table><thead><tr><th>Month</th><th class="num">Sales</th><th class="num">Gross profit</th><th class="num">Expenses</th><th class="num">Net profit</th></tr></thead><tbody>' +
      d.series.slice().reverse().map((s) => '<tr><td>' + e(s.label) + '</td><td class="num">' + m(s.sales) + '</td><td class="num">' + m(s.gross) + '</td><td class="num">' + m(s.expenses) + '</td><td class="num">' + signed(s.net) + '</td></tr>').join('') +
      '</tbody></table></div></div>' +
      '<div class="grid cols2"><div class="card"><h3>Best-selling products (30 days)</h3>' + (d.bestSelling.length
        ? '<table><tbody>' + d.bestSelling.map((p, i) => '<tr><td>' + (i + 1) + '. ' + e(p.name) + '</td><td class="num">' + U.qty(p.qty) + ' sold</td></tr>').join('') + '</tbody></table>'
        : '<p class="muted">No sales in the last 30 days.</p>') + '</div>' +
      '<div class="card"><h3>Recent transactions</h3>' + (d.recent.length
        ? '<table><tbody>' + d.recent.map((s) => '<tr><td><a href="#" data-inv="' + s.id + '">' + e(s.invoiceNo) + '</a><br><span class="muted small">' + e(s.customerName) + ' · ' + e(U.formatDate(s.date)) + '</span></td><td class="num">' + m(s.total) + (s.due > 0 ? '<br><span class="badge low">Due ' + m(s.due) + '</span>' : '') + '</td></tr>').join('') + '</tbody></table>'
        : '<p class="muted">No sales recorded yet.</p>') + '</div></div>';

    MZ.Charts.mount($('#chMonthly'), { type: 'bar', labels: d.series.map((s) => s.label.split(' ')[0]), series: [
      { name: 'Sales', values: d.series.map((s) => s.sales), color: '#14532d' },
      { name: 'Gross profit', values: d.series.map((s) => s.gross), color: '#3b6ea5' },
    ] });
    $$('[data-inv]', el).forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); V.showInvoice(Number(a.dataset.inv)); }));
  };

  /* ---------- Reports ---------- */
  const state = { preset: 'month', from: '', to: '', group: 'day' };
  function presetRange(p) {
    const t = U.today();
    if (p === 'today') return [t, t];
    if (p === 'week') return [U.weekStart(t), t];
    if (p === 'month') return [U.monthKey(t) + '-01', t];
    if (p === 'lastmonth') {
      const first = new Date(t.slice(0, 7) + '-01T00:00:00'); first.setMonth(first.getMonth() - 1);
      const k = U.dateKey(first); const end = new Date(first.getFullYear(), first.getMonth() + 1, 0);
      return [k, U.dateKey(end)];
    }
    if (p === '30') return [U.addDays(t, -29), t];
    if (p === 'year') return [t.slice(0, 4) + '-01-01', t];
    return [state.from || t, state.to || t];
  }
  const pct = (cur, prev) => prev === 0 ? (cur === 0 ? '—' : 'new') : ((cur - prev) / Math.abs(prev) * 100).toFixed(0) + '%';
  const cmp = (cur, prev) => '<span class="muted small">before: ' + m(prev) + ' (' + pct(cur, prev) + ')</span>';

  V.reports = async function (el) {
    const data = await DB.loadAll();
    function draw() {
      if (state.preset !== 'custom') { const r = presetRange(state.preset); state.from = r[0]; state.to = r[1]; }
      const bad = !U.isValidDate(state.from) || !U.isValidDate(state.to) || state.from > state.to;
      const presets = [['today', 'Today'], ['week', 'This week'], ['month', 'This month'], ['lastmonth', 'Last month'], ['30', 'Last 30 days'], ['year', 'This year'], ['custom', 'Custom']];
      let body = '';
      if (bad) body = '<div class="err">Please choose a valid start date that is not after the end date.</div>';
      else {
        const r = A.report(data, state.from, state.to, state.group);
        const t = r.totals, p = r.previous;
        body =
          '<div class="grid tiles">' +
          tile('Sales', m(t.sales), cmp(t.sales, p.sales)) +
          tile('Gross profit', m(t.gross), 'Sales profit, before expenses · ' + cmp(t.gross, p.gross), 'blue') +
          tile('Expenses', m(t.expenses), cmp(t.expenses, p.expenses)) +
          tile('Net profit', m(t.net), 'Gross profit − expenses · ' + cmp(t.net, p.net), t.net < 0 ? 'warn' : '') +
          '</div>' +
          '<p class="muted small">Compared with the previous period (' + e(U.formatDate(r.prevRange[0])) + ' – ' + e(U.formatDate(r.prevRange[1])) + '). ' + t.count + ' sale(s) in this period; ' + m(t.collected) + ' collected, ' + m(t.due) + ' still due from these sales.</p>' +
          '<div class="card"><h3>Sales trend</h3><canvas class="chart" id="chTrend" role="img" aria-label="Sales, gross profit and expenses chart"></canvas></div>' +
          '<div class="card"><h3>Breakdown</h3>' + (r.rows.length ? '<div class="scroll"><table><thead><tr><th>Period</th><th class="num">Sales</th><th class="num">Gross profit</th><th class="num">Expenses</th><th class="num">Net profit</th></tr></thead><tbody>' +
            r.rows.map((x) => '<tr><td>' + e(x.label) + '</td><td class="num">' + m(x.sales) + '</td><td class="num">' + m(x.gross) + '</td><td class="num">' + m(x.expenses) + '</td><td class="num">' + signed(x.net) + '</td></tr>').join('') +
            '</tbody><tfoot><tr><td>Total</td><td class="num">' + m(t.sales) + '</td><td class="num">' + m(t.gross) + '</td><td class="num">' + m(t.expenses) + '</td><td class="num">' + signed(t.net) + '</td></tr></tfoot></table></div>' : '<p class="muted">No records in this period.</p>') + '</div>' +
          '<div class="grid cols2"><div class="card"><h3>Best-selling products</h3>' + (r.bestSelling.length ? '<table><thead><tr><th>Product</th><th class="num">Qty</th><th class="num">Sales</th></tr></thead><tbody>' + r.bestSelling.map((x) => '<tr><td>' + e(x.name) + '</td><td class="num">' + U.qty(x.qty) + '</td><td class="num">' + m(x.revenue) + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">No sales.</p>') + '</div>' +
          '<div class="card"><h3>Most profitable products</h3>' + (r.mostProfitable.length ? '<table><thead><tr><th>Product</th><th class="num">Profit</th></tr></thead><tbody>' + r.mostProfitable.map((x) => '<tr><td>' + e(x.name) + '</td><td class="num">' + signed(x.profit) + '</td></tr>').join('') + '</tbody></table><p class="muted small">Product profit is before any sale-level discount.</p>' : '<p class="muted">No sales.</p>') + '</div></div>' +
          '<div class="card"><h3>Expenses by category</h3>' + (r.expenseByCategory.length ? '<table><tbody>' + r.expenseByCategory.map((x) => '<tr><td>' + e(x.category) + '</td><td class="num">' + m(x.amount) + '</td></tr>').join('') + '</tbody></table>' : '<p class="muted">No expenses.</p>') + '</div>';
        el._trend = r;
      }
      const val = A.valuationRows(data.products);
      const valTotal = A.inventoryValue(data.products);
      const retail = U.round2(val.reduce((a, x) => a + x.retail, 0));
      el.innerHTML = '<div class="page-head"><h2>Reports</h2></div>' +
        '<div class="chips">' + presets.map((x) => '<button type="button" class="chip secondary ' + (state.preset === x[0] ? 'on' : '') + '" data-p="' + x[0] + '">' + x[1] + '</button>').join('') + '</div>' +
        '<div class="row"><div><label for="rFrom">From</label><input type="date" id="rFrom" value="' + e(state.from) + '"></div><div><label for="rTo">To</label><input type="date" id="rTo" value="' + e(state.to) + '"></div></div>' +
        '<label for="rGroup">Show by</label><select id="rGroup"><option value="day"' + (state.group === 'day' ? ' selected' : '') + '>Day</option><option value="week"' + (state.group === 'week' ? ' selected' : '') + '>Week</option><option value="month"' + (state.group === 'month' ? ' selected' : '') + '>Month</option></select>' +
        '<div style="height:14px"></div>' + body +
        '<div class="card"><h3>Inventory valuation (now)</h3><p>Total at cost: <b>' + m(valTotal) + '</b> · If all sold at current prices: <b>' + m(retail) + '</b></p>' +
        (val.length ? '<div class="scroll"><table class="rt"><thead><tr><th>Product</th><th>Category</th><th class="num">Stock</th><th class="num">Cost</th><th class="num">Value</th></tr></thead><tbody>' +
          val.map((x) => '<tr><td class="title" data-l="Product">' + e(x.name) + (x.archived ? ' <span class="badge gray">Archived</span>' : '') + '</td><td data-l="Category">' + e(x.category) + '</td><td class="num" data-l="Stock">' + U.qty(x.qty) + ' ' + e(x.unit) + '</td><td class="num" data-l="Cost">' + m(x.cost) + '</td><td class="num" data-l="Value">' + m(x.value) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No stock on hand.</p>') + '</div>';
      if (!bad && el._trend) {
        const rows = el._trend.rows;
        MZ.Charts.mount($('#chTrend'), { type: rows.length > 12 ? 'line' : 'bar', labels: rows.map((x) => state.group === 'month' ? x.label.split(' ')[0] : x.key.slice(5)), series: [
          { name: 'Sales', values: rows.map((x) => x.sales), color: '#14532d' },
          { name: 'Gross profit', values: rows.map((x) => x.gross), color: '#3b6ea5' },
          { name: 'Expenses', values: rows.map((x) => x.expenses), color: '#b7791f' },
        ] });
      }
      $$('[data-p]', el).forEach((b) => b.addEventListener('click', () => { state.preset = b.dataset.p; if (state.preset === 'custom') { state.from = state.from || U.today(); state.to = state.to || U.today(); } draw(); }));
      $('#rFrom', el).addEventListener('change', (ev) => { state.preset = 'custom'; state.from = ev.target.value; draw(); });
      $('#rTo', el).addEventListener('change', (ev) => { state.preset = 'custom'; state.to = ev.target.value; draw(); });
      $('#rGroup', el).addEventListener('change', (ev) => { state.group = ev.target.value; draw(); });
    }
    draw();
  };
})();
