/* views_sales.js — Sales, invoices, Customers. */
(function () {
  'use strict';
  const U = MZ.U, UI = MZ.UI, { $, $$, opt } = MZ.UI;
  const V = (MZ.Views = MZ.Views || {});
  const e = U.esc, m = U.money;

  /* ---------- Invoice ---------- */
  function invoiceHtml(s) {
    return '<div class="invoice"><h2>MIZAN SOLAR AND ELECTRONICS</h2><div class="sub">Solar &amp; Electronics · Bangladesh</div>' +
      '<div class="meta"><div><b>Invoice:</b> ' + e(s.invoiceNo) + '<br><b>Date:</b> ' + e(U.formatDate(s.date)) + '</div>' +
      '<div><b>Customer:</b> ' + e(s.customerName) + (s.customerPhone ? '<br>' + e(s.customerPhone) : '') + '</div></div>' +
      '<table><thead><tr><th>#</th><th>Item</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Total</th></tr></thead><tbody>' +
      s.items.map((it, i) => '<tr><td>' + (i + 1) + '</td><td>' + e(it.name) + '</td><td class="num">' + U.qty(it.qty) + ' ' + e(it.unit || '') + '</td><td class="num">' + m(it.unitPrice) + '</td><td class="num">' + m(it.lineTotal) + '</td></tr>').join('') +
      '</tbody><tfoot>' +
      (s.discount > 0 ? '<tr><td colspan="4" class="right">Subtotal</td><td class="num">' + m(s.subtotal) + '</td></tr><tr><td colspan="4" class="right">Discount</td><td class="num">-' + m(s.discount) + '</td></tr>' : '') +
      '<tr><td colspan="4" class="right">Total</td><td class="num">' + m(s.total) + '</td></tr>' +
      '<tr><td colspan="4" class="right">Paid</td><td class="num">' + m(s.paid) + '</td></tr>' +
      '<tr><td colspan="4" class="right">Balance due</td><td class="num">' + m(s.due) + '</td></tr></tfoot></table>' +
      (s.note ? '<p><b>Note:</b> ' + e(s.note) + '</p>' : '') + '<p class="sub" style="margin-top:16px">Thank you for your purchase.</p></div>';
  }
  V.showInvoice = async function (sale) {
    if (typeof sale === 'number') sale = await MZ.Sales.getSale(sale);
    if (!sale) return UI.toast('Invoice not found.', true);
    UI.modal({
      title: 'Invoice ' + sale.invoiceNo, wide: true, body: invoiceHtml(sale),
      extraButtons: '<button type="button" id="prn" class="blue">Print invoice</button>',
      onOpen: (d) => d.querySelector('#prn').addEventListener('click', function () {
        document.getElementById('print-area').innerHTML = invoiceHtml(sale);
        window.print();
      }),
    });
  };

  /* ---------- Sale form ---------- */
  async function openSaleForm(onDone) {
    const [allP, customers] = await Promise.all([MZ.Inventory.listProducts(), MZ.DB.getAll('customers')]);
    const products = allP.filter((p) => !p.archived && p.qty > 0).sort((a, b) => a.name.localeCompare(b.name));
    if (!products.length) return UI.toast('There are no products in stock to sell. Add stock first.', true);
    customers.sort((a, b) => a.name.localeCompare(b.name));
    const pById = (id) => products.find((p) => p.id === Number(id));
    let newCustId = null, paidTouched = false;

    const lineHtml = () => '<div class="line" data-line><div class="row"><div class="full"><label>Product</label><select class="lp"><option value="">Choose product…</option>' +
      products.map((p) => '<option value="' + p.id + '">' + e(p.name) + ' — ' + U.qty(p.qty) + ' ' + e(p.unit) + ' in stock</option>').join('') + '</select></div>' +
      '<div><label>Quantity</label><input class="lq" inputmode="decimal" value="1"></div><div><label>Price each (৳)</label><input class="lpr" inputmode="decimal"></div>' +
      '<div class="full"><span class="muted small lhint"></span> <b>Line total: <span class="ltotal">৳0.00</span></b> <button type="button" class="small danger lrm" style="float:right">Remove</button></div></div></div>';

    UI.modal({
      title: 'New sale', wide: true, submitLabel: 'Save sale',
      body: '<div class="row"><div><label>Date</label><input type="date" name="date" value="' + U.today() + '" required></div>' +
        '<div><label>Customer (optional)</label><select name="customerId" id="sCust"><option value="">Walk-in customer</option>' + customers.map((c) => opt(c.id, c.name + (c.phone ? ' · ' + c.phone : ''))).join('') + '<option value="__new">＋ New customer…</option></select></div></div>' +
        '<div class="row hidden" id="newCust"><div><label>New customer name</label><input name="newName"></div><div><label>Phone (optional)</label><input name="newPhone" inputmode="tel"></div></div>' +
        '<div style="margin-top:12px"><b>Items</b></div><div id="lines"></div><button type="button" class="secondary" id="addLine">+ Add another item</button>' +
        '<div class="row"><div><label>Discount (৳)</label><input name="discount" id="sDisc" inputmode="decimal" value="0"></div><div><label>Amount paid now (৳)</label><input name="paid" id="sPaid" inputmode="decimal"></div></div>' +
        '<label>Note (optional)</label><input name="note">' +
        '<div class="totals"><div><span>Subtotal</span><b id="tSub">৳0.00</b></div><div><span>Discount</span><b id="tDisc">৳0.00</b></div><div class="big"><span>Total</span><span id="tTot">৳0.00</span></div>' +
        '<div><span>Gross profit on this sale</span><b id="tProf">৳0.00</b></div><div><span>Balance due</span><b id="tDue">৳0.00</b></div></div>',
      onOpen: function (d) {
        const linesEl = d.querySelector('#lines');
        function calc() {
          let sub = 0, cost = 0;
          $$('[data-line]', d).forEach(function (ln) {
            const p = pById($('.lp', ln).value), q = U.parseNum($('.lq', ln).value), pr = U.parseNum($('.lpr', ln).value);
            const ok = p && q > 0 && pr >= 0;
            const lt = ok ? q * pr : 0;
            $('.ltotal', ln).textContent = m(lt);
            $('.lhint', ln).textContent = p ? 'Cost ' + m(p.costPrice) + ' · ' : '';
            if (ok) { sub += lt; cost += q * p.costPrice; }
          });
          const disc = U.parseNum($('#sDisc', d).value) || 0;
          const total = U.round2(sub - disc);
          if (!paidTouched) $('#sPaid', d).value = total > 0 ? total.toFixed(2) : '';
          const paid = U.parseNum($('#sPaid', d).value) || 0;
          $('#tSub', d).textContent = m(sub); $('#tDisc', d).textContent = m(disc); $('#tTot', d).textContent = m(total);
          $('#tProf', d).textContent = m(total - cost); $('#tDue', d).textContent = m(total - paid);
        }
        function addLine() {
          linesEl.insertAdjacentHTML('beforeend', lineHtml());
          const ln = linesEl.lastElementChild;
          $('.lp', ln).addEventListener('change', function () { const p = pById(this.value); $('.lpr', ln).value = p ? p.sellPrice : ''; calc(); });
          $$('input', ln).forEach((i) => i.addEventListener('input', calc));
          $('.lrm', ln).addEventListener('click', function () { if ($$('[data-line]', d).length > 1) { ln.remove(); calc(); } });
        }
        addLine();
        $('#addLine', d).addEventListener('click', addLine);
        $('#sDisc', d).addEventListener('input', calc);
        $('#sPaid', d).addEventListener('input', function () { paidTouched = true; calc(); });
        $('#sCust', d).addEventListener('change', function () { $('#newCust', d).classList.toggle('hidden', this.value !== '__new'); });
      },
      onSubmit: async function (form) {
        const f = UI.formData(form);
        const items = $$('[data-line]', form).map((ln) => ({ productId: $('.lp', ln).value, qty: $('.lq', ln).value, unitPrice: $('.lpr', ln).value }));
        let customerId = f.customerId;
        if (customerId === '__new') {
          if (!newCustId) newCustId = await MZ.Customers.saveCustomer({ name: f.newName, phone: f.newPhone });
          customerId = newCustId;
        }
        const sale = await MZ.Sales.recordSale({ date: f.date, customerId: customerId || null, discount: f.discount, paid: f.paid, note: f.note, items: items });
        UI.closeDialog(); UI.toast('Sale saved: ' + sale.invoiceNo);
        if (onDone) onDone();
        V.showInvoice(sale);
        return false;
      },
    });
  }

  /* ---------- Sales list ---------- */
  const sf = { q: '', dueOnly: false };
  V.sales = async function (el) {
    const all = await MZ.Sales.listSales();
    const list = all.filter((s) => (!sf.dueOnly || s.due > 0) && (!sf.q || (s.invoiceNo + ' ' + s.customerName + ' ' + s.date).toLowerCase().indexOf(sf.q.toLowerCase()) >= 0)).slice(0, 300);
    el.innerHTML = '<div class="page-head"><h2>Sales</h2><button id="newSale">+ New sale</button></div>' +
      '<div class="toolbar"><input type="search" id="sq" placeholder="Search invoice or customer…" value="' + e(sf.q) + '" aria-label="Search sales"><select id="sdue" aria-label="Filter"><option value="">All sales</option><option value="due"' + (sf.dueOnly ? ' selected' : '') + '>With balance due</option></select></div>' +
      (list.length ? '<table class="rt"><thead><tr><th>Invoice</th><th>Date</th><th>Customer</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th><th class="num">Gross profit</th><th></th></tr></thead><tbody>' +
        list.map((s) => '<tr><td class="title" data-l="Invoice">' + e(s.invoiceNo) + '</td><td data-l="Date">' + e(U.formatDate(s.date)) + '</td><td data-l="Customer">' + e(s.customerName) + '</td><td class="num" data-l="Total">' + m(s.total) + '</td><td class="num" data-l="Paid">' + m(s.paid) + '</td><td class="num" data-l="Due">' + (s.due > 0 ? '<span class="badge low">' + m(s.due) + '</span>' : m(0)) + '</td><td class="num" data-l="Gross profit">' + m(s.profit) + '</td><td class="act"><button class="small secondary" data-inv="' + s.id + '">Invoice</button></td></tr>').join('') + '</tbody></table>' +
        (all.length > 300 ? '<p class="muted small">Showing the latest 300 sales. Use search to find older ones.</p>' : '')
        : '<p class="empty">' + (all.length ? 'No sales match.' : 'No sales yet. Tap “+ New sale” to record your first sale.') + '</p>');
    $('#newSale', el).addEventListener('click', () => openSaleForm(() => V.sales(el)));
    $('#sq', el).addEventListener('input', (ev) => { sf.q = ev.target.value; const pos = ev.target.selectionStart; V.sales(el).then(() => { const q = $('#sq'); q.focus(); q.setSelectionRange(pos, pos); }); });
    $('#sdue', el).addEventListener('change', (ev) => { sf.dueOnly = ev.target.value === 'due'; V.sales(el); });
    $$('[data-inv]', el).forEach((b) => b.addEventListener('click', () => V.showInvoice(Number(b.dataset.inv))));
  };

  /* ---------- Customers ---------- */
  const cf = { q: '', dueOnly: false };
  const custForm = (c) => { c = c || {}; return '<label>Name</label><input name="name" value="' + e(c.name || '') + '" required maxlength="100"><label>Phone</label><input name="phone" inputmode="tel" value="' + e(c.phone || '') + '"><label>Address (optional)</label><input name="address" value="' + e(c.address || '') + '">'; };

  async function openCustomer(id, el) {
    const d = await MZ.Customers.detail(id), c = d.customer;
    UI.modal({
      title: c.name, wide: true,
      body: '<p>' + (c.phone ? '📞 ' + e(c.phone) : '<span class="muted">No phone</span>') + (c.address ? ' · ' + e(c.address) : '') + '</p>' +
        '<div class="grid tiles"><div class="tile"><div class="lbl">Total purchases</div><div class="val">' + m(d.totalSales) + '</div></div><div class="tile"><div class="lbl">Total paid</div><div class="val">' + m(d.totalPaid) + '</div></div><div class="tile ' + (d.balance > 0 ? 'warn' : '') + '"><div class="lbl">Balance due</div><div class="val">' + m(d.balance) + '</div></div></div>' +
        '<h3>Purchase history</h3>' + (d.sales.length ? '<div class="scroll"><table><thead><tr><th>Invoice</th><th>Date</th><th class="num">Total</th><th class="num">Paid</th><th class="num">Due</th></tr></thead><tbody>' + d.sales.map((s) => '<tr><td><a href="#" data-inv="' + s.id + '">' + e(s.invoiceNo) + '</a></td><td>' + e(U.formatDate(s.date)) + '</td><td class="num">' + m(s.total) + '</td><td class="num">' + m(s.paid) + '</td><td class="num">' + m(s.due) + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No purchases yet.</p>') +
        '<h3 style="margin-top:14px">Payment history</h3>' + (d.payments.length ? '<div class="scroll"><table><thead><tr><th>Date</th><th class="num">Amount</th><th>Note</th></tr></thead><tbody>' + d.payments.map((p) => '<tr><td>' + e(U.formatDate(p.date)) + '</td><td class="num">' + m(p.amount) + '</td><td>' + e(p.note || '') + '</td></tr>').join('') + '</tbody></table></div>' : '<p class="muted">No payments yet.</p>'),
      extraButtons: '<button type="button" class="secondary" id="cEdit">Edit</button>' + (d.balance > 0 ? '<button type="button" class="blue" id="cPay">Receive payment</button>' : ''),
      onOpen: function (dl) {
        $$('[data-inv]', dl).forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); V.showInvoice(Number(a.dataset.inv)); }));
        $('#cEdit', dl).addEventListener('click', () => UI.modal({ title: 'Edit customer', body: custForm(c), onSubmit: async (f) => { await MZ.Customers.saveCustomer(UI.formData(f), c.id); UI.toast('Customer updated.'); V.customers(el); } }));
        const pay = $('#cPay', dl);
        if (pay) pay.addEventListener('click', () => UI.modal({
          title: 'Receive payment — ' + c.name, submitLabel: 'Save payment',
          body: '<p>Balance due: <b>' + m(d.balance) + '</b></p><label>Amount received (৳)</label><input name="amount" inputmode="decimal" required><label>Date</label><input type="date" name="date" value="' + U.today() + '" required><label>Note (optional)</label><input name="note">',
          onSubmit: async (f) => { const v = UI.formData(f); await MZ.Customers.receivePayment(c.id, v.amount, v.date, v.note); UI.toast('Payment saved.'); V.customers(el); },
        }));
      },
    });
  }

  V.customers = async function (el) {
    const all = await MZ.Customers.listWithBalances();
    const list = all.filter((c) => (!cf.dueOnly || c.balance > 0) && (!cf.q || (c.name + ' ' + c.phone).toLowerCase().indexOf(cf.q.toLowerCase()) >= 0)).sort((a, b) => b.balance - a.balance || a.name.localeCompare(b.name));
    const owed = U.round2(all.reduce((t, c) => t + Math.max(c.balance, 0), 0));
    el.innerHTML = '<div class="page-head"><h2>Customers</h2><button id="addC">+ New customer</button></div>' +
      '<div class="toolbar"><input type="search" id="cq" placeholder="Search name or phone…" value="' + e(cf.q) + '" aria-label="Search customers"><select id="cdue" aria-label="Filter"><option value="">All customers</option><option value="due"' + (cf.dueOnly ? ' selected' : '') + '>Owing money</option></select></div>' +
      '<p class="muted small">' + all.length + ' customer(s) · total owed to you: <b>' + m(owed) + '</b></p>' +
      (list.length ? '<table class="rt"><thead><tr><th>Name</th><th>Phone</th><th class="num">Purchases</th><th class="num">Balance due</th><th></th></tr></thead><tbody>' +
        list.map((c) => '<tr><td class="title" data-l="Name">' + e(c.name) + '</td><td data-l="Phone">' + e(c.phone || '—') + '</td><td class="num" data-l="Purchases">' + m(c.totalSales) + '</td><td class="num" data-l="Balance due">' + (c.balance > 0 ? '<span class="badge low">' + m(c.balance) + '</span>' : m(0)) + '</td><td class="act"><button class="small secondary" data-open="' + c.id + '">Open</button></td></tr>').join('') + '</tbody></table>'
        : '<p class="empty">' + (all.length ? 'No customers match.' : 'No customers yet. Customers can also be added while recording a sale.') + '</p>');
    $('#addC', el).addEventListener('click', () => UI.modal({ title: 'New customer', body: custForm(), onSubmit: async (f) => { await MZ.Customers.saveCustomer(UI.formData(f)); UI.toast('Customer saved.'); V.customers(el); } }));
    $('#cq', el).addEventListener('input', (ev) => { cf.q = ev.target.value; const pos = ev.target.selectionStart; V.customers(el).then(() => { const q = $('#cq'); q.focus(); q.setSelectionRange(pos, pos); }); });
    $('#cdue', el).addEventListener('change', (ev) => { cf.dueOnly = ev.target.value === 'due'; V.customers(el); });
    $$('[data-open]', el).forEach((b) => b.addEventListener('click', () => openCustomer(Number(b.dataset.open), el)));
  };
})();
