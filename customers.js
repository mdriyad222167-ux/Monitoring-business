/* customers.js — customers, payments, balances. */
(function () {
  'use strict';
  const U = MZ.U, DB = MZ.DB;
  const fail = (m) => { const e = new Error(m); e.userMessage = m; throw e; };

  async function saveCustomer(d, id) {
    const name = U.validText(d.name, 'Customer name', 100); if (!name.ok) fail(name.error);
    const ph = U.validPhone(d.phone); if (!ph.ok) fail(ph.error);
    return DB.transact(['customers'], 'readwrite', async function (s) {
      const all = await s.customers.getAll();
      if (ph.value && all.some((c) => c.id !== id && c.phone === ph.value)) fail('Another customer already uses this phone number.');
      const now = U.nowISO();
      if (id == null) {
        return s.customers.add({ name: name.value, phone: ph.value, address: U.clean(d.address), createdAt: now, updatedAt: now });
      }
      const cur = await s.customers.get(id);
      if (!cur) fail('Customer not found.');
      await s.customers.put(Object.assign({}, cur, { name: name.value, phone: ph.value, address: U.clean(d.address), updatedAt: now }));
      return id;
    });
  }

  // Customers with computed balance (total sales - total payments)
  async function listWithBalances() {
    const all = await DB.transact(['customers', 'sales', 'payments'], 'readonly', async function (s) {
      return { c: await s.customers.getAll(), s: await s.sales.getAll(), p: await s.payments.getAll() };
    });
    return all.c.map(function (c) {
      const sales = all.s.filter((x) => x.customerId === c.id);
      const pays = all.p.filter((x) => x.customerId === c.id);
      const total = sales.reduce((a, x) => a + x.total, 0);
      const paid = pays.reduce((a, x) => a + x.amount, 0);
      return Object.assign({}, c, { totalSales: U.round2(total), totalPaid: U.round2(paid), balance: U.round2(total - paid), saleCount: sales.length });
    });
  }

  async function detail(id) {
    return DB.transact(['customers', 'sales', 'payments'], 'readonly', async function (s) {
      const c = await s.customers.get(id);
      if (!c) fail('Customer not found.');
      const sales = (await s.sales.getAllByIndex('customerId', id)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const payments = (await s.payments.getAllByIndex('customerId', id)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      const total = sales.reduce((a, x) => a + x.total, 0), paid = payments.reduce((a, x) => a + x.amount, 0);
      return { customer: c, sales, payments, balance: U.round2(total - paid), totalSales: U.round2(total), totalPaid: U.round2(paid) };
    });
  }

  // Receive a payment: applied to the oldest unpaid sales first. Cannot exceed what is owed.
  async function receivePayment(customerId, amountRaw, date, note) {
    const a = U.validMoney(amountRaw, 'Payment amount'); if (!a.ok) fail(a.error);
    const dt = U.validDate(date, 'Date'); if (!dt.ok) fail(dt.error);
    return DB.transact(['sales', 'payments', 'customers'], 'readwrite', async function (s) {
      const c = await s.customers.get(customerId);
      if (!c) fail('Customer not found.');
      const sales = (await s.sales.getAllByIndex('customerId', customerId)).filter((x) => x.due > 0)
        .sort((x, y) => (x.createdAt < y.createdAt ? -1 : 1));
      const owed = U.round2(sales.reduce((t, x) => t + x.due, 0));
      if (owed <= 0) fail('This customer has no outstanding balance.');
      if (a.value > owed) fail('Payment (' + U.money(a.value) + ') is more than the amount owed (' + U.money(owed) + ').');
      let left = a.value; const now = U.nowISO();
      for (const sale of sales) {
        if (left <= 0) break;
        const part = U.round2(Math.min(left, sale.due));
        sale.paid = U.round2(sale.paid + part); sale.due = U.round2(sale.total - sale.paid);
        await s.sales.put(sale);
        await s.payments.add({ customerId, saleId: sale.id, amount: part, date: dt.value, note: U.clean(note), kind: 'later', createdAt: now });
        left = U.round2(left - part);
      }
      return a.value;
    });
  }

  MZ.Customers = { saveCustomer, listWithBalances, detail, receivePayment };
})();
