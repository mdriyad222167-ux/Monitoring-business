/* backup.js — manual JSON export / import (replace-all) with validation. */
(function () {
  'use strict';
  const U = MZ.U, DB = MZ.DB;
  const APP = 'MizanBusinessMonitor';
  const FORMAT = 1;
  const DATA_STORES = ['products', 'stockMovements', 'customers', 'sales', 'payments', 'expenses'];
  const fail = (m) => { const e = new Error(m); e.userMessage = m; throw e; };

  async function buildExport() {
    const data = await DB.loadAll();
    const invoiceCounter = await DB.getMeta('invoiceCounter', 0);
    const payload = { stores: {}, invoiceCounter: invoiceCounter };
    DATA_STORES.forEach((n) => { payload.stores[n] = data[n] || []; });
    const body = JSON.stringify(payload);
    const exportId = U.uid();
    const file = {
      app: APP, format: FORMAT, shop: 'MIZAN SOLAR AND ELECTRONICS',
      exportId: exportId, exportedAt: U.nowISO(),
      counts: {}, checksum: U.checksum(body), payload: payload,
    };
    DATA_STORES.forEach((n) => { file.counts[n] = payload.stores[n].length; });
    return file;
  }

  async function exportToFile() {
    const file = await buildExport();
    const blob = new Blob([JSON.stringify(file, null, 1)], { type: 'application/json' });
    const name = 'mizan-backup-' + U.today() + '-' + new Date().toTimeString().slice(0, 5).replace(':', '') + '.json';
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    await DB.setMeta('lastExport', { at: file.exportedAt, id: file.exportId });
    return { name: name, counts: file.counts };
  }

  // Strict validation of a parsed backup. Returns the file or throws a plain-English error.
  function validate(file) {
    if (!file || typeof file !== 'object') fail('This is not a valid backup file.');
    if (file.app !== APP) fail('This file was not created by Mizan Business Monitor.');
    if (file.format !== FORMAT) fail('This backup was made by a different version and cannot be read.');
    if (!file.payload || !file.payload.stores) fail('The backup file is missing its data.');
    const body = JSON.stringify(file.payload);
    if (U.checksum(body) !== file.checksum) fail('The backup file is damaged or was edited (checksum mismatch). Nothing was changed.');
    const st = file.payload.stores;
    DATA_STORES.forEach(function (n) {
      if (!Array.isArray(st[n])) fail('The backup is missing "' + n + '" records.');
      st[n].forEach(function (r, i) {
        if (!r || typeof r !== 'object' || typeof r.id !== 'number') fail('Record ' + (i + 1) + ' in "' + n + '" is invalid.');
      });
    });
    st.sales.forEach(function (s) {
      if (!Array.isArray(s.items) || typeof s.total !== 'number' || typeof s.paid !== 'number' || typeof s.due !== 'number') fail('A sale record in the backup is invalid.');
    });
    st.products.forEach(function (p) {
      if (typeof p.qty !== 'number' || p.qty < 0) fail('A product in the backup has an invalid quantity.');
    });
    return file;
  }

  async function readFile(fileObj) {
    let text;
    try { text = await fileObj.text(); } catch (e) { fail('Could not read the selected file.'); }
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { fail('The selected file is not valid JSON. Choose a Mizan backup file.'); }
    validate(parsed);
    const imported = await DB.getMeta('importedIds', []);
    const dup = imported.find((x) => x.id === parsed.exportId) || null;
    const cur = await DB.loadAll();
    const currentCounts = {};
    DATA_STORES.forEach((n) => { currentCounts[n] = cur[n].length; });
    return { file: parsed, duplicate: dup, currentCounts: currentCounts };
  }

  // Replace ALL current records with the backup's records, in one transaction.
  async function importFile(file) {
    validate(file);
    const imported = await DB.getMeta('importedIds', []);
    await DB.transact(DATA_STORES.concat(['meta']), 'readwrite', async function (s) {
      for (const n of DATA_STORES) {
        await s[n].clear();
        for (const r of file.payload.stores[n]) await s[n].put(r);
      }
      await s.meta.put({ key: 'invoiceCounter', value: file.payload.invoiceCounter || 0 });
      const list = await s.meta.get('importedIds');
      const arr = list ? list.value : imported;
      arr.push({ id: file.exportId, at: U.nowISO(), exportedAt: file.exportedAt });
      await s.meta.put({ key: 'importedIds', value: arr.slice(-200) });
    });
    return file.counts;
  }

  MZ.Backup = { exportToFile, buildExport, readFile, importFile, validate, DATA_STORES };
})();
