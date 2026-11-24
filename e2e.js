// Run: (serve folder on :8765) then  node tests/e2e.js     — needs Playwright + Chrome
const { chromium } = require(process.env.PW || '/opt/npm-tools/node_modules/playwright');
const assert = require('assert');
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('.page-head');
  const ok = (m) => console.log('ok -', m);
  const rejects = async (fn, text) => {
    const r = await page.evaluate(async (src) => { try { await eval(src); return 'NO ERROR'; } catch (e) { return e.userMessage || e.message; } }, fn);
    assert.ok(r.includes(text), `expected "${text}" got "${r}" for ${fn}`);
  };

  // Empty dashboard has no fake data
  assert.ok((await page.textContent('.tiles')).includes('৳0.00')); ok('empty dashboard shows zeros, no fake data');

  // Add products via UI
  await page.click('nav a[data-r=inventory]');
  await page.click('#addP');
  await page.fill('[name=name]', 'Solar Panel 550W'); await page.fill('[name=category]', 'Solar');
  await page.fill('[name=costPrice]', '15000'); await page.fill('[name=sellPrice]', '18000'); await page.fill('[name=qty]', '5'); await page.fill('[name=lowStock]', '3');
  await page.click('#dlgok'); await page.waitForSelector('text=Solar Panel 550W');
  await page.click('#addP');
  await page.fill('[name=name]', 'LED Bulb 12W'); await page.fill('[name=costPrice]', '80'); await page.fill('[name=sellPrice]', '120'); await page.fill('[name=qty]', '50');
  await page.click('#dlgok'); await page.waitForSelector('text=LED Bulb 12W'); ok('products created via UI');

  // Validation: duplicate + negative
  await page.click('#addP'); await page.fill('[name=name]', 'solar panel 550w'); await page.fill('[name=costPrice]', '1'); await page.fill('[name=sellPrice]', '2');
  await page.click('#dlgok'); await page.waitForSelector('#dlgerr .err'); assert.ok((await page.textContent('#dlgerr')).includes('already exists')); await page.click('[data-close]');
  await rejects(`MZ.Inventory.saveProduct({name:'Bad',costPrice:'-5',sellPrice:'10'})`, 'cannot be negative');
  await rejects(`MZ.Inventory.saveProduct({name:'Bad',costPrice:'5',sellPrice:'10',qty:'-3'})`, 'cannot be negative');
  ok('duplicate / negative values rejected');

  // Purchase with weighted average cost: 5 @15000 + 5 @17000 => 16000
  const pid = await page.evaluate(async () => (await MZ.Inventory.listProducts()).find((p) => p.name === 'Solar Panel 550W').id);
  await page.evaluate((id) => MZ.Inventory.addPurchase({ productId: id, qty: '5', unitCost: '17000', date: MZ.U.today() }), pid);
  let p = await page.evaluate((id) => MZ.DB.get('products', id), pid);
  assert.strictEqual(p.qty, 10); assert.strictEqual(p.costPrice, 16000); ok('purchase updates stock + weighted-average cost');
  await rejects(`MZ.Inventory.adjustStock({productId:${pid},change:'-99',reason:'x'})`, 'below zero');
  await page.evaluate((id) => MZ.Inventory.adjustStock({ productId: id, change: '-1', reason: 'Damaged' }), pid);
  p = await page.evaluate((id) => MZ.DB.get('products', id), pid); assert.strictEqual(p.qty, 9); ok('adjustment works, cannot go below zero');

  // Sale via UI: 2 panels, new customer, partial payment
  await page.click('nav a[data-r=sales]'); await page.click('#newSale');
  await page.selectOption('#sCust', '__new'); await page.fill('[name=newName]', 'Rahim Uddin'); await page.fill('[name=newPhone]', '01711-000000');
  await page.selectOption('.lp', String(pid)); await page.fill('.lq', '2');
  assert.strictEqual(await page.inputValue('.lpr'), '18000');
  assert.ok((await page.textContent('#tTot')).includes('36,000.00')); assert.ok((await page.textContent('#tProf')).includes('4,000.00'));
  await page.fill('#sPaid', '30000'); assert.ok((await page.textContent('#tDue')).includes('6,000.00'));
  await page.click('#dlgok'); await page.waitForSelector('.invoice'); assert.ok((await page.textContent('.invoice')).includes('INV-00001'));
  ok('sale saved via UI, live totals + profit correct, invoice shown');
  await page.click('[data-close]');
  p = await page.evaluate((id) => MZ.DB.get('products', id), pid); assert.strictEqual(p.qty, 7); ok('stock auto-deducted after sale');

  // Overselling & invalid payments blocked; nothing changed on failure
  await rejects(`MZ.Sales.recordSale({date:MZ.U.today(),items:[{productId:${pid},qty:'8',unitPrice:'18000'}]})`, 'Not enough stock');
  await rejects(`MZ.Sales.recordSale({date:MZ.U.today(),items:[{productId:${pid},qty:'-1',unitPrice:'18000'}]})`, 'cannot be negative');
  await rejects(`MZ.Sales.recordSale({date:MZ.U.today(),paid:'999999',items:[{productId:${pid},qty:'1',unitPrice:'18000'}]})`, 'more than the sale total');
  await rejects(`MZ.Sales.recordSale({date:MZ.U.today(),paid:'100',items:[{productId:${pid},qty:'1',unitPrice:'18000'}]})`, 'Walk-in sales must be paid in full');
  await rejects(`MZ.Sales.recordSale({date:MZ.U.today(),discount:'99999999',items:[{productId:${pid},qty:'1',unitPrice:'18000'}]})`, 'Discount cannot');
  // multi-line atomicity: 2nd line oversells -> first line must NOT be deducted
  const led = await page.evaluate(async () => (await MZ.Inventory.listProducts()).find((p) => p.name === 'LED Bulb 12W').id);
  await rejects(`MZ.Sales.recordSale({date:MZ.U.today(),items:[{productId:${pid},qty:'1',unitPrice:'18000'},{productId:${led},qty:'500',unitPrice:'120'}]})`, 'Not enough stock');
  p = await page.evaluate((id) => MZ.DB.get('products', id), pid); assert.strictEqual(p.qty, 7);
  assert.strictEqual(await page.evaluate(async () => (await MZ.Sales.listSales()).length), 1); ok('overselling/invalid payments rejected; failed sale is fully rolled back (atomic)');

  // Walk-in full-pay sale
  await page.evaluate((id) => MZ.Sales.recordSale({ date: MZ.U.today(), discount: '20', items: [{ productId: id, qty: '10', unitPrice: '120' }] }), led);
  const led2 = await page.evaluate((id) => MZ.DB.get('products', id), led); assert.strictEqual(led2.qty, 40);
  const s2 = (await page.evaluate(() => MZ.Sales.listSales()))[0]; assert.strictEqual(s2.total, 1180); assert.strictEqual(s2.profit, 380); assert.strictEqual(s2.invoiceNo, 'INV-00002'); ok('walk-in sale w/ discount: total 1180, profit 380 (= 1200-20-800)');

  // Customer payment
  const cid = await page.evaluate(async () => (await MZ.Customers.listWithBalances())[0].id);
  await rejects(`MZ.Customers.receivePayment(${cid},'7000',MZ.U.today(),'')`, 'more than the amount owed');
  await rejects(`MZ.Customers.receivePayment(${cid},'0',MZ.U.today(),'')`, 'greater than zero');
  await page.click('nav a[data-r=customers]'); await page.click('[data-open]');
  await page.click('#cPay'); await page.fill('[name=amount]', '2500'); await page.click('#dlgok'); await page.waitForSelector('text=Payment saved');
  let cb = (await page.evaluate(() => MZ.Customers.listWithBalances()))[0]; assert.strictEqual(cb.balance, 3500);
  await page.evaluate((id) => MZ.Customers.receivePayment(id, '3500', MZ.U.today(), ''), cid);
  cb = (await page.evaluate(() => MZ.Customers.listWithBalances()))[0]; assert.strictEqual(cb.balance, 0);
  const sale1 = await page.evaluate(() => MZ.DB.get('sales', 1)); assert.strictEqual(sale1.due, 0); assert.strictEqual(sale1.paid, 36000); ok('customer payments applied to dues; overpayment blocked');

  // Expenses
  await page.click('nav a[data-r=expenses]'); await page.click('#addE');
  await page.selectOption('[name=category]', 'Electricity'); await page.fill('[name=amount]', '1200'); await page.click('#dlgok'); await page.waitForSelector('text=Expense saved');
  await rejects(`MZ.Expenses.saveExpense({date:MZ.U.today(),category:'Other',amount:'-5'})`, 'cannot be negative');
  const body = await page.textContent('#view'); assert.ok(body.includes('Net profit') && body.includes('Gross profit')); ok('expense saved; gross vs net profit shown separately');

  // Dashboard values from real records
  await page.click('nav a[data-r=dashboard]'); await page.waitForSelector('#chMonthly');
  const tiles = await page.textContent('.tiles');
  assert.ok(tiles.includes('37,180.00'), tiles); // today's sales 36000+1180
  assert.ok(tiles.includes('4,380.00')); // gross
  const inv = 7 * 16000 + 40 * 80; assert.ok(tiles.includes('1,15,200.00') && inv === 115200, 'inventory value ' + tiles);
  const dash = await page.textContent('#view'); assert.ok(dash.includes('INV-00002') && dash.includes('Low-stock')); ok('dashboard: sales 37,180 / gross 4,380 / stock value 1,15,200 from stored records');
  await page.screenshot({ path: '/tmp/shot-dashboard.png', fullPage: true });

  // Reports
  await page.click('nav a[data-r=reports]'); await page.waitForSelector('#chTrend'); assert.ok((await page.textContent('#view')).includes('Inventory valuation'));
  await page.click('[data-p=week]'); await page.click('[data-p=year]'); await page.waitForSelector('#chTrend'); ok('reports render for several ranges');

  // Backup: export
  await page.click('nav a[data-r=backup]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#bkExport')]);
  const path = '/tmp/backup1.json'; await dl.saveAs(path);
  const fs = require('fs'); const bk = JSON.parse(fs.readFileSync(path, 'utf8'));
  assert.strictEqual(bk.counts.sales, 2); assert.strictEqual(bk.counts.products, 2); assert.strictEqual(bk.counts.expenses, 1); assert.ok(bk.counts.payments >= 3); ok('backup exported with all records');

  // Import: invalid files
  fs.writeFileSync('/tmp/bad1.json', 'not json'); fs.writeFileSync('/tmp/bad2.json', JSON.stringify({ app: 'Other' }));
  const tampered = JSON.parse(JSON.stringify(bk)); tampered.payload.stores.sales[0].total = 1; fs.writeFileSync('/tmp/bad3.json', JSON.stringify(tampered));
  for (const [f, text] of [['bad1', 'not valid JSON'], ['bad2', 'not created by Mizan'], ['bad3', 'damaged']]) {
    await page.setInputFiles('#bkFile', `/tmp/${f}.json`); await page.waitForSelector('text=Cannot use this file');
    assert.ok((await page.textContent('#dlg')).includes(text), f); await page.click('[data-close]');
  }
  ok('invalid / non-Mizan / tampered files rejected with clear messages');

  // Change data, then restore the backup (confirm dialog first)
  await page.evaluate(() => MZ.Expenses.saveExpense({ date: MZ.U.today(), category: 'Other', amount: '50' }));
  await page.setInputFiles('#bkFile', path); await page.waitForSelector('text=Replace all records?');
  assert.ok((await page.textContent('#dlg')).includes('Now in app'));
  await page.click('[data-close]');
  assert.strictEqual(await page.evaluate(async () => (await MZ.Expenses.listExpenses()).length), 2); ok('cancelling import changes nothing');
  await page.setInputFiles('#bkFile', path); await page.waitForSelector('text=Replace all records?'); await page.click('#dlgok'); await page.waitForSelector('text=Backup restored');
  assert.strictEqual(await page.evaluate(async () => (await MZ.Expenses.listExpenses()).length), 1); ok('import replaces records after confirmation');
  // Duplicate warning
  await page.click('nav a[data-r=backup]'); await page.setInputFiles('#bkFile', path); await page.waitForSelector('text=already imported'); await page.click('[data-close]'); ok('duplicate import warned');
  // Invoice counter continues after restore
  const s3 = await page.evaluate((id) => MZ.Sales.recordSale({ date: MZ.U.today(), items: [{ productId: id, qty: '1', unitPrice: '120' }] }), led);
  assert.strictEqual(s3.invoiceNo, 'INV-00003'); ok('invoice numbering continues after restore');

  // Persistence across reload + offline
  await page.reload(); await page.waitForSelector('.page-head');
  assert.strictEqual(await page.evaluate(async () => (await MZ.Sales.listSales()).length), 3); ok('data survives refresh');
  await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForTimeout(800);
  await ctx.setOffline(true); await page.reload(); await page.waitForSelector('.page-head'); ok('app opens while offline (service worker)');
  await ctx.setOffline(false);

  // Desktop layout screenshot
  await page.setViewportSize({ width: 1280, height: 800 }); await page.click('nav a[data-r=inventory]'); await page.waitForSelector('table'); await page.screenshot({ path: '/tmp/shot-desktop.png' });
  await page.setViewportSize({ width: 390, height: 800 }); await page.click('nav a[data-r=sales]'); await page.screenshot({ path: '/tmp/shot-sales-mobile.png' });

  assert.deepStrictEqual(errors, [], 'browser errors: ' + errors.join('\n'));
  console.log('\nAll browser tests passed'); await browser.close();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
