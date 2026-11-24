/* charts.js — tiny dependency-free canvas charts (bar & line), works fully offline. */
(function () {
  'use strict';
  const GREEN = '#14532d', BLUE = '#3b6ea5', AMBER = '#b7791f', GRID = '#e5e9e6', TEXT = '#44514a';

  function nice(max) {
    if (max <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(max)));
    const f = max / p;
    const n = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return n * p;
  }
  function short(v) {
    const a = Math.abs(v);
    if (a >= 1e7) return (v / 1e7).toFixed(1).replace(/\.0$/, '') + 'Cr';
    if (a >= 1e5) return (v / 1e5).toFixed(1).replace(/\.0$/, '') + 'L';
    if (a >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return String(Math.round(v));
  }

  /* cfg: { type:'bar'|'line', labels:[], series:[{name, values:[], color}] } */
  function draw(canvas, cfg) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth || 300, h = canvas.clientHeight || 220;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    const c = canvas.getContext('2d');
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    c.font = '12px system-ui, sans-serif';

    const series = cfg.series.map((s, i) => Object.assign({ color: [GREEN, BLUE, AMBER][i % 3] }, s));
    const all = [].concat.apply([], series.map((s) => s.values));
    const hasData = all.some((v) => v !== 0);
    let min = Math.min(0, ...all), max = Math.max(0, ...all);
    if (!hasData) { max = 1; }
    const top = nice(max), bottom = min < 0 ? -nice(-min) : 0;
    const legendH = series.length > 1 ? 22 : 4;
    const L = 44, R = 8, T = 8 + legendH, B = 24;
    const pw = w - L - R, ph = h - T - B;
    const y = (v) => T + ph - ((v - bottom) / (top - bottom)) * ph;

    // grid + y labels
    c.strokeStyle = GRID; c.fillStyle = TEXT; c.lineWidth = 1; c.textAlign = 'right'; c.textBaseline = 'middle';
    for (let i = 0; i <= 4; i++) {
      const v = bottom + ((top - bottom) * i) / 4, yy = y(v);
      c.beginPath(); c.moveTo(L, yy); c.lineTo(w - R, yy); c.stroke();
      c.fillText(short(v), L - 6, yy);
    }
    // x labels
    const n = cfg.labels.length;
    const slot = pw / Math.max(n, 1);
    c.textAlign = 'center'; c.textBaseline = 'top';
    const every = Math.ceil(n / Math.max(1, Math.floor(pw / 60)));
    cfg.labels.forEach((lb, i) => { if (i % every === 0) c.fillText(lb, L + slot * i + slot / 2, h - B + 6); });

    if (cfg.type === 'line') {
      series.forEach(function (s) {
        c.strokeStyle = s.color; c.fillStyle = s.color; c.lineWidth = 2.5; c.beginPath();
        s.values.forEach((v, i) => { const x = L + slot * i + slot / 2; i ? c.lineTo(x, y(v)) : c.moveTo(x, y(v)); });
        c.stroke();
        s.values.forEach((v, i) => { c.beginPath(); c.arc(L + slot * i + slot / 2, y(v), 3.5, 0, 7); c.fill(); });
      });
    } else {
      const gw = slot * 0.7, bw = gw / series.length;
      series.forEach(function (s, si) {
        c.fillStyle = s.color;
        s.values.forEach(function (v, i) {
          const x = L + slot * i + (slot - gw) / 2 + bw * si;
          const y0 = y(0), y1 = y(v);
          c.fillRect(x, Math.min(y0, y1), Math.max(bw - 2, 2), Math.max(Math.abs(y0 - y1), v !== 0 ? 1 : 0));
        });
      });
    }
    // zero line
    c.strokeStyle = '#9aa7a0'; c.beginPath(); c.moveTo(L, y(0)); c.lineTo(w - R, y(0)); c.stroke();

    if (series.length > 1) {
      let x = L; c.textAlign = 'left'; c.textBaseline = 'middle';
      series.forEach(function (s) {
        c.fillStyle = s.color; c.fillRect(x, 8, 12, 12);
        c.fillStyle = TEXT; c.fillText(s.name, x + 16, 14);
        x += 16 + c.measureText(s.name).width + 16;
      });
    }
    if (!hasData) {
      c.fillStyle = '#7b8a82'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText('No data yet', L + pw / 2, T + ph / 2);
    }
  }

  // Redraw on resize
  const registry = new Set();
  function mount(canvas, cfg) {
    const item = { canvas: canvas, cfg: cfg };
    registry.add(item);
    draw(canvas, cfg);
  }
  let t;
  window.addEventListener('resize', function () {
    clearTimeout(t);
    t = setTimeout(function () {
      registry.forEach(function (it) { if (document.body.contains(it.canvas)) draw(it.canvas, it.cfg); else registry.delete(it); });
    }, 150);
  });

  MZ.Charts = { mount: mount, draw: draw };
})();
