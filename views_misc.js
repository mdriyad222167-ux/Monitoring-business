/* views_misc.js — Expenses and Backup screens. */
(function () {
  'use strict';
  const U = MZ.U, UI = MZ.UI, A = MZ.Analytics, { $, $$, opt } = MZ.UI;
  const V = (MZ.Views = MZ.Views || {});
  const e = U.esc, m = U.money;
  let expMonth = U.monthKey(U.today());

  const expForm = (x) => { x = x || {}; return '<div class="row"><div><label>Date</label><input type="date" name="date" value="' + e(x.date || U.today()) + '" required></div>' +
    '<div><label>Category</label><select name="category">' + MZ.Expenses.CATEGORIES.map((c) => opt(c, c, c === x.category)).join('') + '</select></div></div>' +
    '<div class="row"><div><label>Amount (৳)</label><input name="amount" inputmode="decimal" value="' + (x.amount != null ? x.amount : '') + '" required></div><div><label>Note (optional)</label><input name="note" value="' + e(x.note || '') + '"></div></div>'; };

  V.expenses = async function (el) {
    const [all, sales] = await Promise.all([MZ.Expenses.listExpenses(), MZ.Sales.listSales()]);
    const valid = /^\d{4}-\d{2}$/.test(expMonth) ? expMonth : U.monthKey(U.today());
    const list = all.filter((x) => U.monthKey(x.date) === valid);
    const total = U.round2(list.reduce((t, x) => t + x.amount, 0));
    const t = A.totals({ sales: sales, expenses: all }, valid + '-01', valid + '-31');
    const byCat = {}; list.forEach((x) => { byCat[x.category] = (byCat[x.category] || 0) + x.amount; });

    el.innerHTML = '<div class="page-head"><h2>Expenses</h2><button id="addE">+ New expense</button></div>' +
      '<div class="card"><label for="eMonth" style="margin-top:0">Month</label><input type="month" id="eMonth" value="' + e(valid) + '"></div>' +
      '<div class="card"><h3>Profit for ' + e(U.monthLabel(valid)) + '</h3>' +
      '<div class="totals" style="margin-top:0"><div><span>Sales</span><b>' + m(t.sales) + '</b></div><div><span>Gross profit <small class="muted">(sales profit, before expenses)</small></span><b>' + m(t.gross) + '</b></div>' +
      '<div><span>− Expenses</span><b>' + m(total) + '</b></div><div class="big"><span>Net profit <small class="muted">(what you really kept)</small></span><span class="' + (t.net < 0 ? 'neg' : '') + '">' + m(t.net) + '</span></div></div></div>' +
      (Object.keys(byCat).length ? '<div class="card"><h3>By category</h3><table><tbody>' + Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).map((k) => '<tr><td>' + e(k) + '</td><td class="num">' + m(byCat[k]) + '</td></tr>').join('') + '</tbody></table></div>' : '') +
      '<div class="card"><h3>Expense list</h3>' + (list.length ? '<table class="rt"><thead><tr><th>Date</th><th>Category</th><th>Note</th><th class="num">Amount</th><th></th></tr></thead><tbody>' +
        list.map((x) => '<tr><td class="title" data-l="Date">' + e(U.formatDate(x.date)) + '</td><td data-l="Category">' + e(x.category) + '</td><td data-l="Note">' + e(x.note || '—') + '</td><td class="num" data-l="Amount">' + m(x.amount) + '</td><td class="act"><div class="actions"><button class="small secondary" data-ed="' + x.id + '">Edit</button><button class="small danger" data-del="' + x.id + '">Delete</button></div></td></tr>').join('') +
        '</tbody><tfoot><tr><td colspan="3">Total</td><td class="num">' + m(total) + '</td><td></td></tr></tfoot></table>' : '<p class="empty">No expenses in this month.</p>') + '</div>';

    $('#eMonth', el).addEventListener('change', (ev) => { expMonth = ev.target.value; V.expenses(el); });
    $('#addE', el).addEventListener('click', () => UI.modal({ title: 'New expense', body: expForm(), submitLabel: 'Save expense', onSubmit: async (f) => { await MZ.Expenses.saveExpense(UI.formData(f)); UI.toast('Expense saved.'); V.expenses(el); } }));
    $$('[data-ed]', el).forEach((b) => b.addEventListener('click', () => { const x = all.find((y) => y.id === Number(b.dataset.ed)); UI.modal({ title: 'Edit expense', body: expForm(x), onSubmit: async (f) => { await MZ.Expenses.saveExpense(UI.formData(f), x.id); UI.toast('Expense updated.'); V.expenses(el); } }); }));
    $$('[data-del]', el).forEach((b) => b.addEventListener('click', async () => {
      const x = all.find((y) => y.id === Number(b.dataset.del));
      if (await UI.confirmBox('Delete this expense?', e(x.category) + ' · ' + m(x.amount) + ' on ' + e(U.formatDate(x.date)) + '. This cannot be undone.', 'Delete', true)) { await MZ.Expenses.deleteExpense(x.id); UI.toast('Expense deleted.'); V.expenses(el); }
    }));
  };

  /* ---------- Backup ---------- */
  const labels = { products: 'Products', stockMovements: 'Stock movements', customers: 'Customers', sales: 'Sales', payments: 'Payments', expenses: 'Expenses' };

  V.backup = async function (el) {
    const last = await MZ.DB.getMeta('lastExport', null);
    const data = await MZ.DB.loadAll();
    el.innerHTML = '<div class="page-head"><h2>Backup &amp; Transfer</h2></div>' +
      '<div class="banner info">Your records are stored only inside this browser on this device. If you clear browser data or lose the device, they are gone — so save a backup regularly (for example every week).</div>' +
      '<div class="card"><h3>1. Save a backup</h3><p>Downloads one file with <b>all</b> your records (products, stock history, customers, sales, payments, expenses).</p>' +
      '<p class="muted small">Last backup: ' + (last ? e(U.formatDateTime(last.at)) : '<b>never</b>') + '</p><button id="bkExport">Download backup file</button><div id="bkMsg"></div></div>' +
      '<div class="card"><h3>2. Restore or move to another device</h3><p>Choose a backup file. <b>This replaces everything currently in this app</b> with the records from the file. You will see a summary and be asked to confirm first.</p>' +
      '<input type="file" id="bkFile" accept=".json,application/json"></div>' +
      '<div class="card"><h3>Move data between PC and phone</h3><ol><li>On the first device: <b>Download backup file</b>.</li><li>Send the file to the other device (WhatsApp “to myself”, email, USB, or Google Drive).</li><li>On the other device: open this app → Backup → choose the file.</li></ol><p class="muted small">Always use the newest file and only keep working on one device at a time, otherwise newer records on the other device would be replaced.</p></div>' +
      '<div class="card"><h3>Stored on this device now</h3><table><tbody>' + MZ.Backup.DATA_STORES.map((n) => '<tr><td>' + labels[n] + '</td><td class="num">' + data[n].length + '</td></tr>').join('') + '</tbody></table></div>';

    $('#bkExport', el).addEventListener('click', async function () {
      try {
        const r = await MZ.Backup.exportToFile();
        $('#bkMsg', el).innerHTML = '<div class="banner info" style="margin-top:12px">Backup saved as <b>' + e(r.name) + '</b> (' + r.counts.sales + ' sales, ' + r.counts.products + ' products, ' + r.counts.customers + ' customers, ' + r.counts.expenses + ' expenses). Check your Downloads folder.</div>';
      } catch (err) { $('#bkMsg', el).innerHTML = '<div class="err">' + e(UI.errText(err)) + '</div>'; }
    });

    $('#bkFile', el).addEventListener('change', async function (ev) {
      const f = ev.target.files[0]; ev.target.value = '';
      if (!f) return;
      let info;
      try { info = await MZ.Backup.readFile(f); } catch (err) { return UI.modal({ title: 'Cannot use this file', body: '<div class="err" style="margin-top:12px">' + e(UI.errText(err)) + '</div><p>Nothing in the app was changed.</p>' }); }
      const b = info.file;
      const rows = MZ.Backup.DATA_STORES.map((n) => '<tr><td>' + labels[n] + '</td><td class="num">' + info.currentCounts[n] + '</td><td class="num"><b>' + b.counts[n] + '</b></td></tr>').join('');
      UI.modal({
        title: 'Replace all records?', submitLabel: 'Yes, replace my records', wide: true,
        body: (info.duplicate ? '<div class="banner" style="margin-top:12px"><b>This exact backup was already imported on ' + e(U.formatDateTime(info.duplicate.at)) + '.</b> Importing it again will overwrite anything you added since then.</div>' : '') +
          '<p style="margin-top:12px">Backup made on <b>' + e(U.formatDateTime(b.exportedAt)) + '</b>.</p>' +
          '<table><thead><tr><th>Records</th><th class="num">Now in app</th><th class="num">In backup file</th></tr></thead><tbody>' + rows + '</tbody></table>' +
          '<div class="banner" style="margin-top:12px">Everything currently in the app will be replaced. Records that are only in the app and not in the file will be lost. Tip: cancel and download a backup of the current data first if unsure.</div>',
        onSubmit: async function () { await MZ.Backup.importFile(b); UI.toast('Backup restored successfully.'); MZ.refresh(); },
      });
    });
  };
})();
