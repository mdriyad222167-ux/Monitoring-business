/* sales.js — record a sale atomically: check stock, deduct stock, save sale, save payment. */
(function () {
  'use strict';
  const U = MZ.U, DB = MZ.DB;
  const fail = (m) => { const e = new Error(m); e.userMessage = m; throw e; };

  /*
   input: { date, customerId|null, discount, paid, note, items:[{productId, qty, unitPrice}] }
   Walk-in sales (no customer) must be paid in full — there is nobody to collect a due from.
  */
  async function recordSale(input) {
    const dt = U.validDate(input.date, 'Date'); if (!dt.ok) fail(dt.error);
    if (!input.items || !input.items.length) fail('Add at least one product to the sale.');
    const items = [];
    const seen = {};
    input.items.forEach(function (it, i) {
      const q = U.validQty(it.qty, 'Quantity (item ' + (i + 1) + ')'); if (!q.ok) fail(q.error);
      const p = U.validMoney(it.unitPrice, 'Selling price (item ' + (i + 1) + ')', { allowZero: true }); if (!p.ok) fail(p.error);
      const pid = Number(it.productId);
      if (!pid) fail('Choose a product for item ' + (i + 1) + '.');
      if (seen[pid]) fail('The same product is added twice. Combine the quantities into one line.');
      seen[pid] = true;
      items.push({ productId: pid, qty: q.value, unitPrice: p.value });
    });
    const disc = U.validMoney(input.discount === '' || input.discount == null ? 0 : input.discount, 'Discount', { allowZero: true });
    if (!disc.ok) fail(disc.error);
    const customerId = input.customerId ? Number(input.customerId) : null;

    return DB.transact(['products', 'stockMovements', 'customers', 'sales', 'payments', 'meta'], 'readwrite', async function (s) {
      let customer = null;
      if (customerId) { customer = await s.customers.get(customerId); if (!customer) fail('Customer not found.'); }
      const lines = []; let subtotal = 0, cost = 0;
      const now = U.nowISO();
      const updated = [];
      for (const it of items) {
        const p = await s.products.get(it.productId);
        if (!p) fail('A selected product no longer exists.');
        if (p.archived) fail('"' + p.name + '" is archived and cannot be sold.');
        if (it.qty > p.qty) fail('Not enough stock for "' + p.name + '". Available: ' + U.qty(p.qty) + ' ' + p.unit + '.');
        const lineTotal = U.round2(it.qty * it.unitPrice);
        const lineCost = U.round2(it.qty * p.costPrice);
        subtotal += lineTotal; cost += lineCost;
        lines.push({ productId: p.id, name: p.name, unit: p.unit, qty: it.qty, unitPrice: it.unitPrice, unitCost: p.costPrice, lineTotal: lineTotal, lineProfit: U.round2(lineTotal - lineCost) });
        updated.push({ p: p, qty: it.qty });
      }
      subtotal = U.round2(subtotal);
      if (disc.value > subtotal) fail('Discount cannot be more than the sale total.');
      const total = U.round2(subtotal - disc.value);
      const profit = U.round2(total - cost);

      let paidRaw = input.paid === '' || input.paid == null ? total : input.paid;
      const pd = U.validMoney(paidRaw, 'Amount paid', { allowZero: true }); if (!pd.ok) fail(pd.error);
      if (pd.value > total) fail('Amount paid (' + U.money(pd.value) + ') is more than the sale total (' + U.money(total) + ').');
      if (!customer && pd.value < total) fail('Choose a customer to record a partly paid sale. Walk-in sales must be paid in full.');

      const counterRec = await s.meta.get('invoiceCounter');
      const counter = (counterRec ? counterRec.value : 0) + 1;
      await s.meta.put({ key: 'invoiceCounter', value: counter });
      const invoiceNo = 'INV-' + String(counter).padStart(5, '0');

      const sale = {
        invoiceNo: invoiceNo, date: dt.value, customerId: customer ? customer.id : null,
        customerName: customer ? customer.name : 'Walk-in customer', customerPhone: customer ? customer.phone : '',
        items: lines, subtotal: subtotal, discount: disc.value, total: total, cost: U.round2(cost), profit: profit,
        paid: pd.value, due: U.round2(total - pd.value), note: U.clean(input.note), createdAt: now,
      };
      const saleId = await s.sales.add(sale);

      for (const u of updated) {
        const newQty = Math.round((u.p.qty - u.qty) * 1000) / 1000;
        if (newQty < 0) fail('Stock would go negative for "' + u.p.name + '".'); // safety net
        u.p.qty = newQty; u.p.updatedAt = now;
        await s.products.put(u.p);
        await s.stockMovements.add({
          productId: u.p.id, type: 'sale', qtyChange: -u.qty, qtyAfter: newQty, unitCost: u.p.costPrice,
          date: dt.value, note: invoiceNo, refId: saleId, createdAt: now,
        });
      }
      if (pd.value > 0 && customer) {
        await s.payments.add({ customerId: customer.id, saleId: saleId, amount: pd.value, date: dt.value, note: 'Paid at sale ' + invoiceNo, kind: 'at-sale', createdAt: now });
      }
      sale.id = saleId;
      return sale;
    });
  }

  const listSales = async () => (await DB.getAll('sales')).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const getSale = (id) => DB.get('sales', id);

  MZ.Sales = { recordSale, listSales, getSale };
})();
