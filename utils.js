/* utils.js — money, dates, validation, escaping. Pure functions (unit-tested in Node). */
(function (root) {
  'use strict';
  const U = {};

  // ---- Money & numbers (always 2 decimals) ----
  U.round2 = function (n) {
    return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
  };
  U.parseNum = function (v) {
    if (v === null || v === undefined) return NaN;
    const s = String(v).replace(/,/g, '').trim();
    if (s === '') return NaN;
    return Number(s);
  };
  U.money = function (n) {
    const v = U.round2(n || 0);
    const neg = v < 0;
    const parts = Math.abs(v).toFixed(2).split('.');
    // Bangladeshi/Indian digit grouping: 12,34,567.00
    let i = parts[0], last3 = i.slice(-3), rest = i.slice(0, -3);
    if (rest) rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',';
    return (neg ? '-' : '') + '৳' + rest + last3 + '.' + parts[1];
  };
  U.qty = function (n) {
    return String(Math.round(Number(n) * 1000) / 1000);
  };

  // ---- Dates (local time) ----
  const pad = (x) => String(x).padStart(2, '0');
  U.dateKey = function (d) {
    d = d instanceof Date ? d : new Date(d);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };
  U.today = function () { return U.dateKey(new Date()); };
  U.monthKey = function (dateStr) { return String(dateStr).slice(0, 7); };
  U.isValidDate = function (s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(s + 'T00:00:00');
    return !isNaN(d) && U.dateKey(d) === s;
  };
  U.formatDate = function (s) {
    if (!s) return '';
    const d = new Date(String(s).length === 10 ? s + 'T00:00:00' : s);
    if (isNaN(d)) return String(s);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  };
  U.formatDateTime = function (iso) {
    const d = new Date(iso);
    if (isNaN(d)) return String(iso || '');
    return U.formatDate(U.dateKey(d)) + ', ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };
  U.addDays = function (dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return U.dateKey(d);
  };
  // Monday-based week start
  U.weekStart = function (dateStr) {
    const d = new Date(dateStr + 'T00:00:00');
    const diff = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - diff);
    return U.dateKey(d);
  };
  U.monthLabel = function (key) {
    const d = new Date(key + '-01T00:00:00');
    return d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
  };
  U.nowISO = function () { return new Date().toISOString(); };

  // ---- Strings ----
  U.esc = function (s) {
    return String(s === null || s === undefined ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  U.clean = function (s) { return String(s === null || s === undefined ? '' : s).trim().replace(/\s+/g, ' '); };

  // ---- Validation: each returns {ok, value, error} ----
  U.validMoney = function (v, label, opts) {
    opts = opts || {};
    const n = U.parseNum(v);
    if (isNaN(n)) return { ok: false, error: label + ' must be a number.' };
    if (n < 0) return { ok: false, error: label + ' cannot be negative.' };
    if (!opts.allowZero && n === 0) return { ok: false, error: label + ' must be greater than zero.' };
    if (n > 1e9) return { ok: false, error: label + ' is too large.' };
    if (Math.abs(n * 100 - Math.round(n * 100)) > 1e-6) return { ok: false, error: label + ' can have at most 2 decimal places.' };
    return { ok: true, value: U.round2(n) };
  };
  U.validQty = function (v, label, opts) {
    opts = opts || {};
    const n = U.parseNum(v);
    if (isNaN(n)) return { ok: false, error: label + ' must be a number.' };
    if (n < 0) return { ok: false, error: label + ' cannot be negative.' };
    if (!opts.allowZero && n === 0) return { ok: false, error: label + ' must be greater than zero.' };
    if (n > 1e7) return { ok: false, error: label + ' is too large.' };
    if (Math.abs(n * 1000 - Math.round(n * 1000)) > 1e-6) return { ok: false, error: label + ' can have at most 3 decimal places.' };
    return { ok: true, value: Math.round(n * 1000) / 1000 };
  };
  U.validPhone = function (v) {
    const s = U.clean(v);
    if (!s) return { ok: true, value: '' };
    if (!/^[+0-9][0-9 \-]{5,18}$/.test(s)) return { ok: false, error: 'Phone number looks invalid.' };
    return { ok: true, value: s };
  };
  U.validText = function (v, label, max) {
    const s = U.clean(v);
    if (!s) return { ok: false, error: label + ' is required.' };
    if (s.length > (max || 120)) return { ok: false, error: label + ' is too long.' };
    return { ok: true, value: s };
  };
  U.validDate = function (v, label) {
    if (!U.isValidDate(v)) return { ok: false, error: label + ' is not a valid date.' };
    return { ok: true, value: v };
  };

  // Simple deterministic checksum (FNV-1a 32-bit) for backup integrity
  U.checksum = function (str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  };
  U.uid = function () {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  };

  root.MZ = root.MZ || {};
  root.MZ.U = U;
  if (typeof module !== 'undefined' && module.exports) module.exports = U;
})(typeof window !== 'undefined' ? window : globalThis);
