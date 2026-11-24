/* expenses.js — daily expenses. */
(function () {
  'use strict';
  const U = MZ.U, DB = MZ.DB;
  const fail = (m) => { const e = new Error(m); e.userMessage = m; throw e; };
  const CATEGORIES = ['Shop rent', 'Staff salary', 'Electricity', 'Transport', 'Shop supplies', 'Repairs', 'Marketing', 'Tea & snacks', 'Other'];

  function read(d) {
    const dt = U.validDate(d.date, 'Date'); if (!dt.ok) fail(dt.error);
    const a = U.validMoney(d.amount, 'Amount'); if (!a.ok) fail(a.error);
    const cat = U.clean(d.category);
    if (!cat) fail('Choose a category.');
    return { date: dt.value, amount: a.value, category: cat, note: U.clean(d.note) };
  }
  async function saveExpense(d, id) {
    const f = read(d);
    return DB.transact(['expenses'], 'readwrite', async function (s) {
      const now = U.nowISO();
      if (id == null) return s.expenses.add(Object.assign({ createdAt: now, updatedAt: now }, f));
      const cur = await s.expenses.get(id);
      if (!cur) fail('Expense not found.');
      await s.expenses.put(Object.assign({}, cur, f, { updatedAt: now }));
      return id;
    });
  }
  const deleteExpense = (id) => DB.transact(['expenses'], 'readwrite', (s) => s.expenses.delete(id));
  const listExpenses = async () => (await DB.getAll('expenses')).sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? 1 : -1));

  MZ.Expenses = { saveExpense, deleteExpense, listExpenses, CATEGORIES };
})();
