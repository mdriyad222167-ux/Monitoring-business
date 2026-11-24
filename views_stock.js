/* views_stock.js — Inventory screen. */
(function () {
  'use strict';
  const U = MZ.U, I = MZ.Inventory, UI = MZ.UI, { $, $$, opt } = MZ.UI;
  const V = (MZ.Views = MZ.Views || {});
  const e = U.esc, m = U.money;
  const filt = { q: '', cat: '', showArchived: false, lowOnly: false };

  function productForm(p) {
    const isNew = !p; p = p || {};
    return '<label for="fName">Product name</label><input id="fName" name="name" value="' + e(p.name || '') + '" required maxlength="100" autocomplete="off">' +
      '<div class="row"><div><label for="fCat">Category</label><input id="fCat" name="category" list="catList" value="' + e(p.category || '') + '" placeholder="e.g. Solar panel, LED, Battery" autocomplete="off"></div>' +
      '<div><label for="fUnit">Unit</label><input id="fUnit" name="unit" value="' + e(p.unit || 'pcs') + '" placeholder="pcs, meter, set"></div></div>' +
      '<div class="row"><div><label for="fCost">Purchase cost (৳ each)</label><input id="fCost" name="costPrice" inputmode="decimal" value="' + (p.costPrice != null ? p.costPrice : '') + '" required></div>' +
      '<div><label for="fPrice">Selling price (৳ each)</label><input id="fPrice" name="sellPrice" inputmode="decimal" value="' + (p.sellPrice != null ? p.sellPrice : '') + '" required></div></div>' +
      '<div class="row">' + (isNew ? '<div><label for="fQty">Opening quantity</label><input id="fQty" name="qty" inputmode="decimal" value="0"></div>' : '') +
      '<div><label for="fLow">Warn me when stock is at or below</label><input id="fLow" name="lowStock" inputmode="decimal" value="' + (p.lowStock != null ? p.lowStock : 5) + '"></div></div>' +
      (isNew ? '' : '<p class="muted small">To change the quantity, use <b>Add stock</b> or <b>Adjust</b> so there is a record of it.</p>');
  }

  V.inventory = async function (el) {
    const products = await I.listProducts();
    const cats = Array.from(new Set(products.map((p) => p.category))).sort();
    const list = products.filter(function (p) {
      if (!filt.showArchived && p.archived) return false;
      if (filt.cat && p.category !== filt.cat) return false;
      if (filt.lowOnly && !(p.lowStock > 0 && p.qty <= p.lowStock)) return false;
      if (filt.q && (p.name + ' ' + p.category).toLowerCase().indexOf(filt.q.toLowerCase()) < 0) return false;
      return true;
    }).sort((a, b) => a.name.localeCompare(b.name));
    const totalCost = U.round2(list.reduce((t, p) => t + p.qty * p.costPrice, 0));

    el.innerHTML =
      '<div class="page-head"><h2>Stock</h2><button id="addP">+ New product</button></div>' +
      '<datalist id="catList">' + cats.map((c) => '<option value="' + e(c) + '">').join('') + '</datalist>' +
      '<div class="toolbar"><input type="search" id="q" placeholder="Search products…" value="' + e(filt.q) + '" aria-label="Search products">' +
      '<select id="cat" aria-label="Category"><option value="">All categories</option>' + cats.map((c) => opt(c, c, c === filt.cat)).join('') + '</select>' +
      '<select id="mode" aria-label="Filter"><option value="active"' + (!filt.showArchived && !filt.lowOnly ? ' selected' : '') + '>Active products</option><option value="low"' + (filt.lowOnly ? ' selected' : '') + '>Low stock only</option><option value="all"' + (filt.showArchived ? ' selected' : '') + '>Include archived</option></select></div>' +
      '<p class="muted small">' + list.length + ' product(s) · stock value at cost: <b>' + m(totalCost) + '</b></p>' +
      (list.length ? '<table class="rt"><thead><tr><th>Product</th><th>Category</th><th class="num">Stock</th><th class="num">Cost</th><th class="num">Price</th><th class="num">Value</th><th></th></tr></thead><tbody>' +
        list.map(function (p) {
          const low = p.lowStock > 0 && p.qty <= p.lowStock;
          return '<tr><td class="title" data-l="Product">' + e(p.name) + (p.archived ? ' <span class="badge gray">Archived</span>' : '') + '</td>' +
            '<td data-l="Category">' + e(p.category) + '</td>' +
            '<td class="num" data-l="Stock">' + U.qty(p.qty) + ' ' + e(p.unit) + (low && !p.archived ? ' <span class="badge low">Low</span>' : '') + '</td>' +
            '<td class="num" data-l="Cost">' + m(p.costPrice) + '</td><td class="num" data-l="Price">' + m(p.sellPrice) + '</td>' +
            '<td class="num" data-l="Value">' + m(p.qty * p.costPrice) + '</td>' +
            '<td class="act"><div class="actions">' +
            (p.archived ? '<button class="small secondary" data-a="restore" data-id="' + p.id + '">Restore</button>' :
              '<button class="small" data-a="buy" data-id="' + p.id + '">Add stock</button><button class="small secondary" data-a="adj" data-id="' + p.id + '">Adjust</button><button class="small secondary" data-a="edit" data-id="' + p.id + '">Edit</button>') +
            '<button class="small secondary" data-a="hist" data-id="' + p.id + '">History</button>' +
            (p.archived ? '' : '<button class="small danger" data-a="arch" data-id="' + p.id + '">Archive</button>') + '</div></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="empty">' + (products.length ? 'No products match your search.' : 'No products yet. Tap “+ New product” to add your first one.') + '</p>');

    $('#q', el).addEventListener('input', function (ev) { filt.q = ev.target.value; const pos = ev.target.selectionStart; V.inventory(el).then(() => { const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); }); });
    $('#cat', el).addEventListener('change', (ev) => { filt.cat = ev.target.value; V.inventory(el); });
    $('#mode', el).addEventListener('change', (ev) => { filt.showArchived = ev.target.value === 'all'; filt.lowOnly = ev.target.value === 'low'; V.inventory(el); });
    $('#addP', el).addEventListener('click', () => UI.modal({
      title: 'New product', submitLabel: 'Save product', body: productForm(null),
      onSubmit: async (f) => { await I.saveProduct(UI.formData(f)); UI.toast('Product saved.'); V.inventory(el); },
    }));
    const byId = (id) => products.find((p) => p.id === Number(id));
    $$('[data-a]', el).forEach((b) => b.addEventListener('click', async function () {
      const p = byId(b.dataset.id), a = b.dataset.a;
      if (a === 'edit') UI.modal({ title: 'Edit product', body: productForm(p), onSubmit: async (f) => { await I.saveProduct(UI.formData(f), p.id); UI.toast('Product updated.'); V.inventory(el); } });
      if (a === 'buy') UI.modal({
        title: 'Add stock: ' + p.name, submitLabel: 'Add to stock',
        body: '<p class="muted small">Current stock: ' + U.qty(p.qty) + ' ' + e(p.unit) + ' · current cost ' + m(p.costPrice) + '. The average cost is updated automatically.</p>' +
          '<div class="row"><div><label>Quantity bought</label><input name="qty" inputmode="decimal" required></div><div><label>Cost per unit (৳)</label><input name="unitCost" inputmode="decimal" value="' + p.costPrice + '" required></div></div>' +
          '<div class="row"><div><label>Date</label><input type="date" name="date" value="' + U.today() + '" required></div><div><label>Supplier (optional)</label><input name="supplier"></div></div><label>Note (optional)</label><input name="note">',
        onSubmit: async (f) => { await I.addPurchase(Object.assign(UI.formData(f), { productId: p.id })); UI.toast('Stock added.'); V.inventory(el); },
      });
      if (a === 'adj') UI.modal({
        title: 'Adjust stock: ' + p.name, submitLabel: 'Save adjustment',
        body: '<p class="muted small">Current stock: <b>' + U.qty(p.qty) + ' ' + e(p.unit) + '</b>. Use a minus sign to reduce (e.g. -2 for damaged items).</p>' +
          '<label>Change in quantity</label><input name="change" inputmode="decimal" placeholder="-2 or 3" required><label>Reason</label><input name="reason" placeholder="Damaged, counted again, returned…" required>',
        onSubmit: async (f) => { await I.adjustStock(Object.assign(UI.formData(f), { productId: p.id })); UI.toast('Stock adjusted.'); V.inventory(el); },
      });
      if (a === 'arch') { if (await UI.confirmBox('Archive product?', '“' + e(p.name) + '” will be hidden from lists and cannot be sold. Its history is kept and you can restore it any time.', 'Archive')) { await I.setArchived(p.id, true); UI.toast('Archived.'); V.inventory(el); } }
      if (a === 'restore') { await I.setArchived(p.id, false); UI.toast('Restored.'); V.inventory(el); }
      if (a === 'hist') {
        const rows = await I.history(p.id);
        const label = { opening: 'Opening stock', purchase: 'Purchase', sale: 'Sale', adjustment: 'Adjustment' };
        UI.modal({
          title: 'History: ' + p.name, wide: true,
          body: rows.length ? '<div class="scroll"><table><thead><tr><th>Date</th><th>Type</th><th class="num">Change</th><th class="num">Stock after</th><th>Note</th></tr></thead><tbody>' + rows.map((r) =>
            '<tr><td>' + e(U.formatDateTime(r.createdAt)) + '</td><td>' + e(label[r.type] || r.type) + '</td><td class="num ' + (r.qtyChange < 0 ? 'neg' : 'pos') + '">' + (r.qtyChange > 0 ? '+' : '') + U.qty(r.qtyChange) + '</td><td class="num">' + U.qty(r.qtyAfter) + '</td><td>' + e([r.supplier, r.note, r.type === 'purchase' ? '@ ' + m(r.unitCost) : ''].filter(Boolean).join(' · ')) + '</td></tr>').join('') + '</tbody></table></div>'
            : '<p class="empty">No stock movements yet.</p>',
        });
      }
    }));
  };
})();
