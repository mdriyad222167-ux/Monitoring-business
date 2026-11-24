/* ui.js — dialog, toast, confirm, form helpers. */
(function () {
  'use strict';
  const U = MZ.U;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const dlg = () => document.getElementById('dlg');

  let toastTimer;
  function toast(msg, bad) {
    const t = document.getElementById('toast');
    t.textContent = msg; t.className = bad ? 'bad' : '';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), bad ? 6000 : 3000);
  }
  const errText = (e) => (e && e.userMessage) || 'Something went wrong: ' + ((e && e.message) || e) + '. Your data was not changed.';

  function closeDialog() { const d = dlg(); if (d.open) d.close(); d.innerHTML = ''; }

  /* modal({title, body, submitLabel, onSubmit(formEl) -> promise, wide, hideFooter, extraButtons}) */
  function modal(o) {
    const d = dlg();
    d.className = o.wide ? 'wide' : '';
    d.innerHTML =
      '<form method="dialog" novalidate id="dlgform">' +
      '<div class="dlg-head"><h3>' + U.esc(o.title) + '</h3><button type="button" class="x secondary" data-close aria-label="Close">✕</button></div>' +
      '<div class="dlg-body">' + o.body + '<div id="dlgerr"></div></div>' +
      '<div class="dlg-foot">' +
      (o.extraButtons || '') +
      '<button type="button" class="secondary" data-close>' + (o.onSubmit ? 'Cancel' : 'Close') + '</button>' +
      (o.onSubmit ? '<button type="submit" id="dlgok">' + U.esc(o.submitLabel || 'Save') + '</button>' : '') +
      '</div></form>';
    const form = d.querySelector('form');
    d.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeDialog));
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!o.onSubmit) return;
      const ok = document.getElementById('dlgok'); ok.disabled = true;
      document.getElementById('dlgerr').innerHTML = '';
      try {
        const keep = await o.onSubmit(form);
        if (keep !== false) closeDialog();
      } catch (err) {
        document.getElementById('dlgerr').innerHTML = '<div class="err" role="alert">' + U.esc(errText(err)) + '</div>';
        if (!err.userMessage) console.error(err);
        ok.disabled = false;
      }
    });
    if (!d.open) d.showModal();
    if (o.onOpen) o.onOpen(d);
    return d;
  }

  function confirmBox(title, message, okLabel, danger) {
    return new Promise(function (resolve) {
      const d = dlg();
      d.className = '';
      d.innerHTML =
        '<form method="dialog"><div class="dlg-head"><h3>' + U.esc(title) + '</h3></div>' +
        '<div class="dlg-body"><div style="padding-top:12px">' + message + '</div></div>' +
        '<div class="dlg-foot"><button type="button" class="secondary" id="cNo">Cancel</button>' +
        '<button type="button" class="' + (danger ? 'danger' : '') + '" id="cYes">' + U.esc(okLabel || 'Yes') + '</button></div></form>';
      const done = (v) => { closeDialog(); resolve(v); };
      d.querySelector('#cNo').onclick = () => done(false);
      d.querySelector('#cYes').onclick = () => done(true);
      d.oncancel = () => resolve(false);
      d.showModal();
    });
  }

  // Convert a form into a plain object
  const formData = (form) => Object.fromEntries(new FormData(form).entries());

  const opt = (v, label, sel) => '<option value="' + U.esc(v) + '"' + (sel ? ' selected' : '') + '>' + U.esc(label) + '</option>';

  window.MZ.UI = { $, $$, toast, modal, confirmBox, closeDialog, formData, errText, opt };
})();
