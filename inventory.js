/* inventory.js — products, purchases, stock adjustments, history. */
(function () {
  'use strict';
  const U = MZ.U, DB = MZ.DB;
  const fail = (m) => { const e = new Error(m); e.userMessage = m; throw e; };

  function readProductForm(d) {
    const name = U.validText(d.name, 'Product name', 100); if (!name.ok) fail(name.error);
    const cost = U.validMoney(d.costPrice, 'Purchase cost', { allowZero: true }); if (!cost.ok) fail(cost.error);
    const price = U.validMoney(d.sellPrice, 'Selling price'); if (!price.ok) fail(price.error);
    const low = U.validQty(d.lowStock === '' || d.lowStock == null ? 0 : d.lowStock, 'Low-stock level', { allowZero: true });
    if (!low.ok) fail(low.error);
    return {
      name: name.value,
      category: U.clean(d.category) || 'General',
      unit: U.clean(d.unit) || 'pcs',
      costPrice: cost.value, sellPrice: price.value, lowStock: low.value,
    };
  }

  // Create (id == null) or edit a product. Quantity on create = opening stock.
  async function saveProduct(d, id) {
    const f = readProductForm(d);
    let openQty = 0;
    if (id == null) {
      const q = U.validQty(d.qty === '' || d.qty == null ? 0 : d.qty, 'Opening quantity', { allowZero: true });
      if (!q.ok) fail(q.error);
      openQty = q.value;
    }
    return DB.transact(['products', 'stockMovements'], 'readwrite', async function (s) {
      const all = await s.products.getAll();
      const dup = all.find((p) => p.id !== id && p.name.toLowerCase() === f.name.toLowerCase());
      if (dup) fail('A product named "' + dup.name + '" already exists.');
      const now = U.nowISO();
      if (id == null) {
        const rec = Object.assign({ qty: openQty, archived: false, createdAt: now, updatedAt: now }, f);
        const newId = await s.products.add(rec);
        if (openQty > 0) {
          await s.stockMovements.add({
            productId: newId, type: 'opening', qtyChange: openQty, qtyAfter: openQty, unitCost: f.costPrice,
            date: U.today(), note: 'Opening stock', createdAt: now,
          });
        }
        return newId;
      }
      const cur = await s.products.get(id);
      if (!cur) fail('Product not found.');
      await s.products.put(Object.assign({}, cur, f, { updatedAt: now }));
      return id;
    });
  }

  async function setArchived(id, archived) {
    return DB.transact(['products'], 'readwrite', async function (s) {
      const p = await s.products.get(id);
      if (!p) fail('Product not found.');
      p.archived = !!archived; p.updatedAt = U.nowISO();
      await s.products.put(p);
    });
  }

  // Purchase: adds stock and updates weighted-average cost.
  async function addPurchase(d) {
    const q = U.validQty(d.qty, 'Quantity'); if (!q.ok) fail(q.error);
    const c = U.validMoney(d.unitCost, 'Unit cost', { allowZero: true }); if (!c.ok) fail(c.error);
    const dt = U.validDate(d.date, 'Date'); if (!dt.ok) fail(dt.error);
    return DB.transact(['products', 'stockMovements'], 'readwrite', async function (s) {
      const p = await s.products.get(Number(d.productId));
      if (!p) fail('Product not found.');
      const newQty = Math.round((p.qty + q.value) * 1000) / 1000;
      const avg = newQty > 0 ? (p.qty * p.costPrice + q.value * c.value) / newQty : c.value;
      const now = U.nowISO();
      p.qty = newQty; p.costPrice = U.round2(avg); p.updatedAt = now;
      await s.products.put(p);
      await s.stockMovements.add({
        productId: p.id, type: 'purchase', qtyChange: q.value, qtyAfter: newQty, unitCost: c.value,
        date: dt.value, supplier: U.clean(d.supplier), note: U.clean(d.note), createdAt: now,
      });
      return p.id;
    });
  }

  // Adjustment: signed change (e.g. damaged = -2, found = +1). Cannot go below zero.
  async function adjustStock(d) {
    const raw = U.parseNum(d.change);
    if (isNaN(raw) || raw === 0) fail('Enter a quantity change (use a minus sign to reduce stock).');
    if (Math.abs(raw * 1000 - Math.round(raw * 1000)) > 1e-6) fail('Quantity can have at most 3 decimal places.');
    const reason = U.validText(d.reason, 'Reason', 200); if (!reason.ok) fail(reason.error);
    return DB.transact(['products', 'stockMovements'], 'readwrite', async function (s) {
      const p = await s.products.get(Number(d.productId));
      if (!p) fail('Product not found.');
      const newQty = Math.round((p.qty + raw) * 1000) / 1000;
      if (newQty < 0) fail('Stock cannot go below zero. Current stock is ' + U.qty(p.qty) + '.');
      const now = U.nowISO();
      p.qty = newQty; p.updatedAt = now;
      await s.products.put(p);
      await s.stockMovements.add({
        productId: p.id, type: 'adjustment', qtyChange: Math.round(raw * 1000) / 1000, qtyAfter: newQty,
        unitCost: p.costPrice, date: U.today(), note: reason.value, createdAt: now,
      });
    });
  }

  async function history(productId) {
    const rows = await DB.transact(['stockMovements'], 'readonly', (s) => s.stockMovements.getAllByIndex('productId', productId));
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  const listProducts = () => DB.getAll('products');

  MZ.Inventory = { saveProduct, setArchived, addPurchase, adjustStock, history, listProducts };
})();
