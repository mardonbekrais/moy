// ================================================================
// MOYTRACK PRO v4.1  —  app.js
// Supabase to'g'ri ulanish · Test · LocalStorage DB
// ================================================================

// ===== DATABASE =====
const DB = {
  get(k, d = []) { try { const v = localStorage.getItem('mt_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v)      { try { localStorage.setItem('mt_' + k, JSON.stringify(v)); } catch(e) { console.warn(e); } },
  nextId(k)      { const id = this.get('_id_' + k, 0) + 1; this.set('_id_' + k, id); return id; }
};

// ===== DEFAULT SMS =====
const DEFAULT_SMS = {
  save_message:           '{car_name} ({car_number}) saqlandi!\n📅 {date} {time}\n🔧 Almashtirildi: {services}\n🏁 Probeg: {km} km',
  oil_message:            '{car_name} ({car_number}) — dvigatel moyi: {oil_brand}\n📅 {date} {time} · 🏁 {km} km',
  gearbox_message:        '{car_name} ({car_number}) — karobka moyi yangilandi\n📅 {date} {time} · 🏁 {km} km',
  default_change_message: '{car_name} ({car_number}) — {service_label} almashtirildi\n📅 {date} {time} · 🏁 {km} km',
};

// ===== SUPABASE SOZLAMALARI =====
// MUHIM: Supabase dashboard > Settings > API > "anon public" key ni ishlating
// "sb_publishable_..." kalit REST API uchun ISHLAMAYDI
const SUPA_URL = 'https://qscvtxtgbwbshkrqklgk.supabase.co';
const SUPA_KEY = 'sb_publishable_SsWaBdGmEv6RvF33oAv4bw_qTjFC5mY'; // <- bu to'g'ri emas, anon key kerak

// ===== STATE =====
let allCars = DB.get('cars', []);
let allOils = DB.get('oils', [
  { id: 1, name: 'SAE 5W-30',  interval: 10000 },
  { id: 2, name: 'SAE 5W-40',  interval: 7000  },
  { id: 3, name: 'SAE 10W-40', interval: 8000  }
]);
let smsConfig = DB.get('sms', {
  api_url: '', enabled: false, sms_sent_count: 0, devsms_token: '',
  supabase_url: SUPA_URL, supabase_key: SUPA_KEY, supabase_enabled: true,
  ...DEFAULT_SMS
});
// Har safar SUPA_URL/KEY ni yangilab qo'yamiz
smsConfig.supabase_url     = SUPA_URL;
smsConfig.supabase_key     = SUPA_KEY;
smsConfig.supabase_enabled = true;

let cfg  = DB.get('cfg', { warn_pct: 80, danger_pct: 100, theme: 'dark' });
let WPCT = cfg.warn_pct   / 100;
let DPCT = cfg.danger_pct / 100;
let curCar = null;

const saveCars = () => DB.set('cars', allCars);
const saveOils = () => DB.set('oils', allOils);
const saveSms  = () => DB.set('sms',  smsConfig);
const saveCfg  = () => DB.set('cfg',  cfg);

// ===== SERVICE META =====
const SVC_META = {
  oil:          { icon: '🛢️', label: 'Dvigatel Moyi' },
  antifreeze:   { icon: '🔵', label: 'Antifriz'       },
  gearbox:      { icon: '🟢', label: 'Karobka Moyi'   },
  air_filter:   { icon: '💨', label: 'Havo Filtr'     },
  cabin_filter: { icon: '🌬️', label: 'Salon Filtr'    },
  oil_filter:   { icon: '🔩', label: 'Moy Filtr'      },
};

// ===== THEME =====
function applyTheme() {
  const l = cfg.theme === 'light';
  document.body.classList.toggle('light', l);
  document.getElementById('theme-btn').textContent = l ? '🌙' : '☀️';
  const tog = document.getElementById('dark-mode-toggle'); if (tog) tog.checked = l;
  const lbl = document.getElementById('theme-label');       if (lbl) lbl.textContent = l ? '☀️ Kunduzgi rejim' : '🌙 Tungi rejim';
}
function toggleTheme(l) { cfg.theme = l ? 'light' : 'dark'; saveCfg(); applyTheme(); }
document.getElementById('theme-btn').addEventListener('click', () => {
  cfg.theme = cfg.theme === 'dark' ? 'light' : 'dark'; saveCfg(); applyTheme();
});

// ===== HELPERS =====
function oilInt(name) { const o = allOils.find(o => o.name === name); return o ? o.interval : 10000; }

function carSt(car) {
  const oU  = (car.total_km - car.oil_change_km) / oilInt(car.oil_name);
  const aU  = (car.total_km - car.antifreeze_km) / (car.antifreeze_interval || 30000);
  const gU  = (car.total_km - car.gearbox_km)    / (car.gearbox_interval    || 50000);
  const afU = (car.total_km - (car.air_filter_km   || car.total_km)) / (car.air_filter_interval   || 15000);
  const cfU = (car.total_km - (car.cabin_filter_km || car.total_km)) / (car.cabin_filter_interval || 15000);
  const ofU = (car.total_km - (car.oil_filter_km   || car.total_km)) / (car.oil_filter_interval   || 10000);
  const m   = Math.max(oU, aU, gU, afU, cfU, ofU);
  if (m >= DPCT) return { cls: 'su', dot: 'dug' };
  if (m >= WPCT) return { cls: 'sw', dot: 'dwn' };
  return { cls: '', dot: 'dok' };
}

function svcE(u) { return u >= DPCT ? '🔴' : u >= WPCT ? '🟡' : '🟢'; }

function badgeOf(u) {
  if (u >= DPCT) return { t: '🔴 HOZIR!', c: 'bdn', b: 'd' };
  if (u >= WPCT) return { t: '🟡 Tez!',   c: 'bwn', b: 'w' };
  return { t: '🟢 Yaxshi', c: 'bok', b: '' };
}

function nowDate() { return new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' }); }
function nowTime() { return new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }); }

// ===== NAVIGATION =====
function navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(page).classList.add('active');
  document.querySelectorAll('.nb').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  if      (page === 'home')    loadDashboard();
  else if (page === 'cars')    { loadCarsGrid(); document.getElementById('car-search').value = ''; }
  else if (page === 'add-car') resetAddCarForm();
  else if (page === 'oils')    loadOilsPage();
  else if (page === 'sms')     loadSmsPage();
}
document.querySelectorAll('.nb').forEach(b => b.addEventListener('click', () => navigateTo(b.dataset.page)));

// ===== DASHBOARD =====
function loadDashboard() {
  let u = 0, w = 0, g = 0, uc = [], wc = [];
  allCars.forEach(car => {
    const s = carSt(car);
    if      (s.cls === 'su') { u++; uc.push(car); }
    else if (s.cls === 'sw') { w++; wc.push(car); }
    else g++;
  });
  document.getElementById('total-stat').textContent   = allCars.length;
  document.getElementById('urgent-stat').textContent  = u;
  document.getElementById('warning-stat').textContent = w;
  document.getElementById('good-stat').textContent    = g;

  const uel = document.getElementById('urgent-list');
  const notif = [...uc, ...wc];
  uel.innerHTML = notif.length
    ? notif.map(ciHTML).join('')
    : '<div class="empty"><div class="ei">🎉</div><p>Hammasi yaxshi!</p></div>';
  addCIE(uel);

  const ael = document.getElementById('all-cars-list');
  ael.innerHTML = allCars.length
    ? allCars.map(ciHTML).join('')
    : '<div class="empty"><div class="ei">🚗</div><p>Hali mashina qo\'shilmagan</p></div>';
  addCIE(ael);
}

function ciHTML(car) {
  const s   = carSt(car);
  const oi  = oilInt(car.oil_name);
  const oU  = (car.total_km - car.oil_change_km) / oi;
  const aU  = (car.total_km - car.antifreeze_km) / (car.antifreeze_interval || 30000);
  const gU  = (car.total_km - car.gearbox_km)    / (car.gearbox_interval    || 50000);
  const afU = (car.total_km - (car.air_filter_km   || car.total_km)) / (car.air_filter_interval   || 15000);
  const cfU = (car.total_km - (car.cabin_filter_km || car.total_km)) / (car.cabin_filter_interval || 15000);
  const ofU = (car.total_km - (car.oil_filter_km   || car.total_km)) / (car.oil_filter_interval   || 10000);
  return `<div class="ci ${s.cls}" data-id="${car.id}">
    <div class="cav">🚗</div>
    <div class="cinfo">
      <div class="cname">${car.car_name}</div>
      <div class="cmeta">${car.car_number} · ${car.total_km.toLocaleString()} km</div>
      <div class="cbadges">${svcE(oU)}${svcE(aU)}${svcE(gU)}${svcE(afU)}${svcE(cfU)}${svcE(ofU)}</div>
    </div>
  </div>`;
}

function addCIE(el) {
  el.querySelectorAll('.ci').forEach(e => {
    e.addEventListener('click', () => { curCar = allCars.find(c => c.id == e.dataset.id); openModal(); });
  });
}

// ===== CARS GRID =====
function loadCarsGrid(q = '') {
  const grid = document.getElementById('cars-grid');
  const f = q
    ? allCars.filter(c => c.car_number.toLowerCase().includes(q) || c.car_name.toLowerCase().includes(q))
    : allCars;
  if (!f.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="ei">${allCars.length ? '🔍' : '🚗'}</div><p>${allCars.length ? 'Topilmadi' : 'Mashinalar yo\'q'}</p></div>`;
    return;
  }
  grid.innerHTML = f.map(car => {
    const s   = carSt(car);
    const oi  = oilInt(car.oil_name);
    const oU  = (car.total_km - car.oil_change_km) / oi;
    const aU  = (car.total_km - car.antifreeze_km) / (car.antifreeze_interval || 30000);
    const gU  = (car.total_km - car.gearbox_km)    / (car.gearbox_interval    || 50000);
    const afU = (car.total_km - (car.air_filter_km   || car.total_km)) / (car.air_filter_interval   || 15000);
    const cfU = (car.total_km - (car.cabin_filter_km || car.total_km)) / (car.cabin_filter_interval || 15000);
    const ofU = (car.total_km - (car.oil_filter_km   || car.total_km)) / (car.oil_filter_interval   || 10000);
    return `<div class="cc" data-id="${car.id}">
      <div class="cc-top">🚗<div class="cdot ${s.dot}"></div></div>
      <div class="cc-body">
        <div class="cn">${car.car_name}</div>
        <div class="cnum">${car.car_number}</div>
        <div class="ckm">🏁 ${car.total_km.toLocaleString()} km</div>
        <div class="cst">${svcE(oU)}${svcE(aU)}${svcE(gU)}${svcE(afU)}${svcE(cfU)}${svcE(ofU)}</div>
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.cc').forEach(e => {
    e.addEventListener('click', () => { curCar = allCars.find(c => c.id == e.dataset.id); openModal(); });
  });
}
function filterGrid() { loadCarsGrid(document.getElementById('car-search').value.toLowerCase().trim()); }

// ===== OIL SELECT =====
function renderOilSel(id, val) {
  const sel = document.getElementById(id); if (!sel) return;
  const cur = val || sel.value;
  sel.innerHTML = '<option value="">Tanlang...</option>' +
    allOils.map(o => `<option value="${o.name}"${o.name === cur ? ' selected' : ''}>${o.name} (${o.interval.toLocaleString()} km)</option>`).join('');
}

// ===== CHECKBOX =====
function toggleCheck(el) { el.classList.toggle('checked'); }

// ===== PILL BUTTONS =====
function setPillStatus(svc, status, btn) {
  const km = parseFloat(document.getElementById('current-km')?.value) || 0;
  let interval, kmFieldId, hintId, pillHintId;
  if (svc === 'anti') {
    interval   = parseFloat(document.getElementById('antifreeze-interval')?.value) || 30000;
    kmFieldId  = 'antifreeze-km';
    hintId     = 'antifreeze-hint';
    pillHintId = 'anti-pill-hint';
  } else {
    interval   = parseFloat(document.getElementById('gearbox-interval')?.value) || 50000;
    kmFieldId  = 'gearbox-km';
    hintId     = 'gearbox-hint';
    pillHintId = 'gear-pill-hint';
  }
  btn.closest('.pill-group').querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active-pill'));
  btn.classList.add('active-pill');
  const pct   = status === 'green' ? 0.2 : status === 'yellow' ? 0.8 : 1.05;
  const kmVal = Math.max(0, Math.round(km - interval * pct));
  document.getElementById(kmFieldId).value = kmVal;
  const labels = { green: ['🟢','green','Yaxshi holat'], yellow: ['🟡','yellow','Tez orada kerak'], red: ['🔴','red','Hoziroq kerak!'] };
  const [icon, cls, text] = labels[status];
  const used = Math.max(0, km - kmVal);
  setChip(pillHintId, cls, `${icon} ${text} · ${used.toLocaleString()} / ${interval.toLocaleString()} km`);
  calcChip(hintId, km, kmVal, interval);
}

// ===== HINT CHIPS =====
function setChip(id, cls, html) {
  const el = document.getElementById(id); if (!el) return;
  el.innerHTML = `<span class="sch ${cls}">${html}</span>`;
}
function clearChip(id) { const el = document.getElementById(id); if (el) el.innerHTML = ''; }
function calcChip(hintId, totalKm, lastKm, interval) {
  if (!totalKm || !lastKm || !interval) { clearChip(hintId); return; }
  const u    = (totalKm - lastKm) / interval;
  const used = Math.max(0, totalKm - lastKm);
  if      (u >= DPCT) setChip(hintId, 'red',    `🔴 HOZIROQ — ${used.toLocaleString()} / ${interval.toLocaleString()} km`);
  else if (u >= WPCT) setChip(hintId, 'yellow', `🟡 Tez orada — ${used.toLocaleString()} / ${interval.toLocaleString()} km`);
  else                 setChip(hintId, 'green',  `🟢 Yaxshi — ${used.toLocaleString()} / ${interval.toLocaleString()} km`);
}

function setupHintListeners() {
  const pairs = [
    ['current-km','oil-change-km',   'oil-hint',          ()=>[parseFloat(document.getElementById('current-km')?.value)||0, parseFloat(document.getElementById('oil-change-km')?.value)||0, oilInt(document.getElementById('oil-name')?.value)]],
    ['current-km','antifreeze-km',   'antifreeze-hint',   ()=>[parseFloat(document.getElementById('current-km')?.value)||0, parseFloat(document.getElementById('antifreeze-km')?.value)||0, parseFloat(document.getElementById('antifreeze-interval')?.value)||30000]],
    ['current-km','gearbox-km',      'gearbox-hint',      ()=>[parseFloat(document.getElementById('current-km')?.value)||0, parseFloat(document.getElementById('gearbox-km')?.value)||0, parseFloat(document.getElementById('gearbox-interval')?.value)||50000]],
    ['current-km','air-filter-km',   'air-filter-hint',   ()=>[parseFloat(document.getElementById('current-km')?.value)||0, parseFloat(document.getElementById('air-filter-km')?.value)||0, parseFloat(document.getElementById('air-filter-interval')?.value)||15000]],
    ['current-km','cabin-filter-km', 'cabin-filter-hint', ()=>[parseFloat(document.getElementById('current-km')?.value)||0, parseFloat(document.getElementById('cabin-filter-km')?.value)||0, parseFloat(document.getElementById('cabin-filter-interval')?.value)||15000]],
    ['current-km','oil-filter-km',   'oil-filter-hint',   ()=>[parseFloat(document.getElementById('current-km')?.value)||0, parseFloat(document.getElementById('oil-filter-km')?.value)||0, parseFloat(document.getElementById('oil-filter-interval')?.value)||10000]],
  ];
  pairs.forEach(([id1, id2, hintId, getVals]) => {
    [id1, id2].forEach(id => {
      document.getElementById(id)?.addEventListener('input', () => { const [t,l,i] = getVals(); calcChip(hintId, t, l, i); });
    });
  });
  document.getElementById('oil-name')?.addEventListener('change', () => {
    const km  = parseFloat(document.getElementById('current-km')?.value)||0;
    const okm = parseFloat(document.getElementById('oil-change-km')?.value)||0;
    calcChip('oil-hint', km, okm, oilInt(document.getElementById('oil-name')?.value));
  });
}
setupHintListeners();

function resetAddCarForm() {
  document.getElementById('add-car-form').reset();
  renderOilSel('oil-name');
  ['oil-hint','antifreeze-hint','gearbox-hint','air-filter-hint','cabin-filter-hint','oil-filter-hint','anti-pill-hint','gear-pill-hint'].forEach(clearChip);
  document.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active-pill'));
  document.querySelectorAll('.check-item').forEach(b => b.classList.remove('checked'));
}

// ===== SMS TEMPLATE =====
function fillTemplate(tmpl, car, svcType) {
  if (!tmpl) return '';
  return tmpl
    .replace(/{car_name}/g,   car.car_name)
    .replace(/{car_number}/g, car.car_number)
    .replace(/{km}/g,         car.total_km.toLocaleString())
    .replace(/{date}/g,        nowDate())
    .replace(/{time}/g,        nowTime())
    .replace(/{oil_brand}/g,   car.oil_name || '—');
}

function buildSaveSmsText(car, checkedKeys) {
  const tmpl = smsConfig.save_message || DEFAULT_SMS.save_message;
  const servicesList = checkedKeys.map(k => { const m = SVC_META[k]; return m ? `${m.icon} ${m.label}` : k; }).join(', ');
  return tmpl
    .replace(/{car_name}/g,   car.car_name)
    .replace(/{car_number}/g, car.car_number)
    .replace(/{km}/g,         car.total_km.toLocaleString())
    .replace(/{date}/g,        nowDate())
    .replace(/{time}/g,        nowTime())
    .replace(/{services}/g,    servicesList || 'Ko\'rsatilmagan')
    .replace(/{oil_brand}/g,   car.oil_name || '—');
}

// ===== DEVSMS =====
async function sendSms(text, phone) {
  const token = smsConfig.devsms_token;
  if (!token || !phone) { console.log(`📤 SMS (token yo'q) → ${phone}\n${text}`); return { ok: false }; }
  try {
    const r = await fetch('https://devsms.uz/api/send_sms.php', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: phone.replace(/\D/g, ''), message: text })
    });
    const data = await r.json().catch(() => ({}));
    console.log('DevSMS javob:', data);
    return data;
  } catch(e) {
    console.warn('SMS xatosi:', e);
    return { ok: false };
  }
}

// ===== AVTOMATIK TEKSHIRUV =====
const AUTO_CHECK_INTERVAL = 60 * 1000;
const SENT_TODAY_KEY = 'auto_sms_sent';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function wasSentToday(carId, type) { const log = DB.get(SENT_TODAY_KEY, {}); return log[carId + '_' + type] === todayStr(); }
function markSentToday(carId, type) {
  const log = DB.get(SENT_TODAY_KEY, {});
  log[carId + '_' + type] = todayStr();
  const week = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
  Object.keys(log).forEach(k => { if (log[k] < week) delete log[k]; });
  DB.set(SENT_TODAY_KEY, log);
}

async function autoCheckAndSend() {
  if (!smsConfig.enabled || !smsConfig.devsms_token) return;
  const svcs = [
    { key: 'oil',          getU: car => (car.total_km - car.oil_change_km) / oilInt(car.oil_name) },
    { key: 'antifreeze',   getU: car => (car.total_km - car.antifreeze_km) / (car.antifreeze_interval || 30000) },
    { key: 'gearbox',      getU: car => (car.total_km - car.gearbox_km)    / (car.gearbox_interval    || 50000) },
    { key: 'air_filter',   getU: car => (car.total_km - (car.air_filter_km   || car.total_km)) / (car.air_filter_interval   || 15000) },
    { key: 'cabin_filter', getU: car => (car.total_km - (car.cabin_filter_km || car.total_km)) / (car.cabin_filter_interval || 15000) },
    { key: 'oil_filter',   getU: car => (car.total_km - (car.oil_filter_km  || car.total_km)) / (car.oil_filter_interval   || 10000) },
  ];
  for (const car of allCars) {
    if (!car.phone_number) continue;
    for (const svc of svcs) {
      const u = svc.getU(car);
      if (u >= DPCT && !wasSentToday(car.id, svc.key)) {
        const svcLabel = SVC_META[svc.key]?.label || svc.key;
        const tplKey   = svc.key + '_message';
        const tmpl     = smsConfig[tplKey] || DEFAULT_SMS[tplKey] || DEFAULT_SMS.default_change_message;
        const text     = fillTemplate(tmpl, car, svc.key).replace(/{service_label}/g, svcLabel);
        await sendSms(text, car.phone_number);
        markSentToday(car.id, svc.key);
        smsConfig.sms_sent_count = (smsConfig.sms_sent_count || 0) + 1;
        saveSms();
      }
    }
  }
}

let autoCheckTimer = null;
function startAutoCheck() {
  if (autoCheckTimer) clearInterval(autoCheckTimer);
  autoCheckTimer = setInterval(autoCheckAndSend, AUTO_CHECK_INTERVAL);
}

// ===== SUPABASE =====
// TO'G'RI ULANISH:
// 1. https://supabase.com/dashboard/project/qscvtxtgbwbshkrqklgk/settings/api
// 2. "Project API keys" bo'limidan "anon public" key ni ko'ching (eyJ... bilan boshlanadi)
// 3. Quyidagi SUPA_KEY ni o'sha key bilan almashtiring
// 4. Supabase SQL Editor'da quyidagi jadvallarni yarating:
//
//   CREATE TABLE IF NOT EXISTS cars (
//     id BIGSERIAL PRIMARY KEY,
//     car_name TEXT, car_number TEXT UNIQUE,
//     phone_number TEXT, total_km INT, oil_name TEXT,
//     added_at TIMESTAMPTZ DEFAULT NOW()
//   );
//   CREATE TABLE IF NOT EXISTS service_logs (
//     id BIGSERIAL PRIMARY KEY,
//     car_name TEXT, car_number TEXT,
//     service_type TEXT, km_at_change INT,
//     changed_at TIMESTAMPTZ DEFAULT NOW()
//   );
//   ALTER TABLE cars ENABLE ROW LEVEL SECURITY;
//   ALTER TABLE service_logs ENABLE ROW LEVEL SECURITY;
//   CREATE POLICY "anon full" ON cars FOR ALL USING (true) WITH CHECK (true);
//   CREATE POLICY "anon full" ON service_logs FOR ALL USING (true) WITH CHECK (true);

async function supabaseReq(path, method, body, overrideUrl, overrideKey) {
  const url = overrideUrl || smsConfig.supabase_url || SUPA_URL;
  const key = overrideKey || smsConfig.supabase_key || SUPA_KEY;
  if (!url || !key) return { ok: false, status: 0, error: 'URL yoki Key yo\'q' };
  try {
    const headers = {
      'Content-Type':  'application/json',
      'apikey':        key,
      'Authorization': 'Bearer ' + key,
    };
    if (method !== 'GET') headers['Prefer'] = 'return=minimal';

    const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/' + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    let responseBody = null;
    try { responseBody = await r.json(); } catch(e) {}
    return { ok: r.ok, status: r.status, body: responseBody };
  } catch(e) {
    return { ok: false, status: 0, error: e.message || 'Tarmoq xatosi (CORS yoki URL noto\'g\'ri)' };
  }
}

// ── ULANISHNI TEKSHIRISH ──
async function testSupabase() {
  const url = document.getElementById('supabase-url').value.trim();
  const key = document.getElementById('supabase-key').value.trim();
  const btn = document.getElementById('btn-test-supabase');
  const res = document.getElementById('supabase-test-result');

  if (!url || !key) {
    res.style.display = 'block';
    res.className     = 'supa-result fail';
    res.innerHTML     = '❌ URL va Key ni kiriting';
    return;
  }

  // Loading holati
  btn.disabled  = true;
  btn.className = 'btn-test-supa loading';
  btn.innerHTML = '<span class="spin">⏳</span> Tekshirilmoqda...';
  res.style.display = 'block';
  res.className = 'supa-result loading';
  res.innerHTML = '⏳ Supabase ga ulanmoqda...';

  // /rest/v1/ ga GET — Supabase har doim javob beradi agar URL va key to'g'ri bo'lsa
  const result = await supabaseReq('', 'GET', null, url, key);
  const proj   = url.replace('https://', '').split('.')[0];

  if (result.error && result.status === 0) {
    // Tarmoq xatosi — CORS yoki URL butunlay noto'g'ri
    btn.className = 'btn-test-supa fail';
    btn.innerHTML = '❌ Link xato';
    res.className = 'supa-result fail';
    res.innerHTML = `❌ <strong>Link xato!</strong> Serverga ulanib bo'lmadi.<br>
      <span style="font-size:12px">Sabab: ${result.error}</span><br>
      <span style="font-size:11px;opacity:.7">URL: ${url}</span>`;
  } else if (result.status === 401 || result.status === 403) {
    // URL to'g'ri lekin Key noto'g'ri
    btn.className = 'btn-test-supa fail';
    btn.innerHTML = '❌ Key xato';
    res.className = 'supa-result fail';
    res.innerHTML = `❌ <strong>API Key noto'g'ri!</strong><br>
      <span style="font-size:12px">Supabase dashboard → Settings → API → <strong>"anon public"</strong> key ni ishlating.<br>
      "sb_publishable_..." kalit ishlamaydi — "eyJ..." bilan boshlanadigan keyni oling.</span>`;
  } else if (result.status >= 200 && result.status < 500) {
    // Har qanday 2xx/3xx/4xx — server javob berdi = ulanish ishlayapti
    btn.className = 'btn-test-supa ok';
    btn.innerHTML = '✅ Done — Ulanish ishlayapti';
    res.className = 'supa-result ok';
    res.innerHTML = `✅ <strong>Done!</strong> Supabase ulanish muvaffaqiyatli.<br>
      <span style="font-size:12px">Loyiha: <strong>${proj}</strong> · Status: ${result.status}</span>`;
    // Sozlamalarni saqlash
    smsConfig.supabase_url     = url;
    smsConfig.supabase_key     = key;
    smsConfig.supabase_enabled = true;
    saveSms();
  } else {
    btn.className = 'btn-test-supa fail';
    btn.innerHTML = '❌ Link xato';
    res.className = 'supa-result fail';
    res.innerHTML = `❌ <strong>Link xato!</strong> Javob: HTTP ${result.status}<br>
      <span style="font-size:11px;opacity:.7">URL: ${url}</span>`;
  }

  btn.disabled = false;
  setTimeout(() => {
    btn.className = 'btn-test-supa';
    btn.innerHTML = '🔗 Ulanishni Tekshirish';
    res.style.display = 'none';
  }, 10000);
}

// ── MA'LUMOT SAQLASH ──
async function supabaseSaveCar(car) {
  if (!smsConfig.supabase_enabled) return;
  const r = await supabaseReq('cars', 'POST', {
    car_name: car.car_name, car_number: car.car_number,
    phone_number: car.phone_number, total_km: car.total_km,
    oil_name: car.oil_name, added_at: car.added_at
  });
  if (r.ok) console.log('✅ Supabase: mashina saqlandi');
  else      console.warn('⚠️ Supabase cars xato:', r.status, r.body);
}

async function supabaseSaveServiceChange(car, type, km) {
  if (!smsConfig.supabase_enabled) return;
  const r = await supabaseReq('service_logs', 'POST', {
    car_name: car.car_name, car_number: car.car_number,
    service_type: type, km_at_change: km,
    changed_at: new Date().toISOString()
  });
  if (r.ok) console.log('✅ Supabase: xizmat saqlandi');
  else      console.warn('⚠️ Supabase service_logs xato:', r.status, r.body);
}

// ===== ADD CAR =====
document.getElementById('add-car-form').addEventListener('submit', e => {
  e.preventDefault();
  const km     = parseInt(document.getElementById('current-km').value)   || 0;
  const name   = document.getElementById('car-name').value.trim();
  const number = document.getElementById('car-number').value.trim();
  const oil    = document.getElementById('oil-name').value;
  if (!name || !number || !oil) { showToast('❌ Barcha maydonlarni to\'ldiring', 'error'); return; }

  const car = {
    id:                   DB.nextId('car'),
    car_name:             name, car_number: number,
    daily_km:             parseInt(document.getElementById('daily-km').value)              || 50,
    phone_number:         document.getElementById('phone-number').value.trim(),
    oil_name:             oil, total_km: km,
    oil_change_km:        parseInt(document.getElementById('oil-change-km').value)         || km,
    antifreeze_km:        parseInt(document.getElementById('antifreeze-km').value)         || km,
    gearbox_km:           parseInt(document.getElementById('gearbox-km').value)            || km,
    antifreeze_interval:  parseInt(document.getElementById('antifreeze-interval').value)   || 30000,
    gearbox_interval:     parseInt(document.getElementById('gearbox-interval').value)      || 50000,
    air_filter_km:        parseInt(document.getElementById('air-filter-km').value)         || km,
    air_filter_interval:  parseInt(document.getElementById('air-filter-interval').value)   || 15000,
    cabin_filter_km:      parseInt(document.getElementById('cabin-filter-km').value)       || km,
    cabin_filter_interval:parseInt(document.getElementById('cabin-filter-interval').value) || 15000,
    oil_filter_km:        parseInt(document.getElementById('oil-filter-km').value)         || km,
    oil_filter_interval:  parseInt(document.getElementById('oil-filter-interval').value)   || 10000,
    history: [], added_at: new Date().toISOString()
  };

  const checkedKeys = [];
  document.querySelectorAll('.check-item.checked').forEach(el => {
    const key = el.dataset.key;
    checkedKeys.push(key);
    car.history.push({ type: key, km: car.total_km, oil_name: key === 'oil' ? oil : null, date: car.added_at });
    if (key === 'oil')          car.oil_change_km   = km;
    if (key === 'antifreeze')   car.antifreeze_km   = km;
    if (key === 'gearbox')      car.gearbox_km      = km;
    if (key === 'air_filter')   car.air_filter_km   = km;
    if (key === 'cabin_filter') car.cabin_filter_km = km;
    if (key === 'oil_filter')   car.oil_filter_km   = km;
  });

  allCars.push(car);
  saveCars();
  supabaseSaveCar(car);

  if (smsConfig.enabled && smsConfig.devsms_token && car.phone_number) {
    const smsText = buildSaveSmsText(car, checkedKeys);
    sendSms(smsText, car.phone_number);
    smsConfig.sms_sent_count = (smsConfig.sms_sent_count || 0) + 1;
    saveSms();
    showToast('✅ Saqlandi · SMS yuborildi!', 'success');
  } else {
    showToast('✅ Mashina qo\'shildi!', 'success');
  }
  resetAddCarForm();
  navigateTo('cars');
});

// ===== OILS PAGE =====
function loadOilsPage() {
  const list = document.getElementById('oils-list');
  list.innerHTML = allOils.length
    ? allOils.map(o => `<div class="oi"><div><div class="on">🛢️ ${o.name}</div><div class="oint">📍 ${o.interval.toLocaleString()} km</div></div><button class="odel" onclick="deleteOil(${o.id})">🗑️</button></div>`).join('')
    : '<div class="empty"><div class="ei">🛢️</div><p>Hech qanday moy yo\'q</p></div>';
}
document.getElementById('add-oil-form').addEventListener('submit', e => {
  e.preventDefault();
  const name = document.getElementById('oil-name-input').value.trim();
  const interval = parseInt(document.getElementById('oil-interval-input').value);
  if (!name || !interval) { showToast('❌ To\'ldiring', 'error'); return; }
  allOils.push({ id: DB.nextId('oil'), name, interval });
  saveOils();
  showToast('✅ Moy turi qo\'shildi!', 'success');
  document.getElementById('add-oil-form').reset();
  loadOilsPage();
});
function deleteOil(id) {
  if (!confirm('Moy turini o\'chirasizmi?')) return;
  allOils = allOils.filter(o => o.id !== id); saveOils();
  showToast('✅ O\'chirildi!', 'success'); loadOilsPage();
}

// ===== SMS PAGE =====
function loadSmsPage() {
  document.getElementById('devsms-token').value        = smsConfig.devsms_token  || '';
  document.getElementById('sms-enabled').checked       = !!smsConfig.enabled;
  document.getElementById('supabase-url').value        = smsConfig.supabase_url  || SUPA_URL;
  document.getElementById('supabase-key').value        = smsConfig.supabase_key  || SUPA_KEY;
  document.getElementById('supabase-enabled').checked  = true;
  document.getElementById('sms-save-message').value    = smsConfig.save_message    || DEFAULT_SMS.save_message;
  document.getElementById('sms-oil-message').value     = smsConfig.oil_message     || DEFAULT_SMS.oil_message;
  document.getElementById('sms-gearbox-message').value = smsConfig.gearbox_message || DEFAULT_SMS.gearbox_message;
  document.getElementById('sms-sent-count').textContent = (smsConfig.sms_sent_count || 0).toLocaleString();

  const ae = document.getElementById('sms-api-status');
  ae.textContent = smsConfig.devsms_token ? '✅ Token kiritilgan' : '❌ Token kiritilmagan';
  ae.style.color = smsConfig.devsms_token ? 'var(--success)' : 'var(--danger)';

  const card = document.getElementById('sms-status-card');
  const el   = document.getElementById('sms-status');
  if (smsConfig.enabled && smsConfig.devsms_token) { el.textContent = '✅ SMS faol'; card.classList.add('on'); }
  else if (!smsConfig.devsms_token)                { el.textContent = '⚠️ DevSMS token kiritilmagan'; card.classList.remove('on'); }
  else                                              { el.textContent = '❌ SMS o\'chirilgan'; card.classList.remove('on'); }
}
document.getElementById('sms-config-form').addEventListener('submit', e => {
  e.preventDefault();
  smsConfig.devsms_token      = document.getElementById('devsms-token').value.trim();
  smsConfig.enabled           = document.getElementById('sms-enabled').checked;
  smsConfig.supabase_url      = document.getElementById('supabase-url').value || SUPA_URL;
  smsConfig.supabase_key      = document.getElementById('supabase-key').value || SUPA_KEY;
  smsConfig.supabase_enabled  = true;
  smsConfig.save_message      = document.getElementById('sms-save-message').value;
  smsConfig.oil_message       = document.getElementById('sms-oil-message').value;
  smsConfig.gearbox_message   = document.getElementById('sms-gearbox-message').value;
  saveSms();
  startAutoCheck();
  showToast('✅ SMS sozlamalari saqlandi!', 'success');
  loadSmsPage();
});
function resetSmsCount() {
  if (!confirm('Hisoblagichni nolga tiklaysizmi?')) return;
  smsConfig.sms_sent_count = 0; saveSms(); showToast('✅ Tiklandi', 'success'); loadSmsPage();
}

// ===== CAR MODAL =====
function openModal() {
  if (!curCar) return;
  const oi  = oilInt(curCar.oil_name);
  const oU  = (curCar.total_km - curCar.oil_change_km) / oi;
  const aU  = (curCar.total_km - curCar.antifreeze_km) / (curCar.antifreeze_interval || 30000);
  const gU  = (curCar.total_km - curCar.gearbox_km)    / (curCar.gearbox_interval    || 50000);
  const afU = (curCar.total_km - (curCar.air_filter_km   || curCar.total_km)) / (curCar.air_filter_interval   || 15000);
  const cfU = (curCar.total_km - (curCar.cabin_filter_km || curCar.total_km)) / (curCar.cabin_filter_interval || 15000);
  const ofU = (curCar.total_km - (curCar.oil_filter_km   || curCar.total_km)) / (curCar.oil_filter_interval   || 10000);

  document.getElementById('modal-car-info').innerHTML = `
    <h3>${curCar.car_name}</h3><p>${curCar.car_number}</p>
    <p style="margin-top:4px;font-size:12px;opacity:.85">🏁 Probeg: <strong>${curCar.total_km.toLocaleString()} km</strong></p>`;

  const svcBlock = (u, label, used, interval) => {
    const b = badgeOf(u);
    return `<div class="svi"><h4>${label}</h4><span class="badge ${b.c}">${b.t}</span>
      <div class="pb"><div class="pf ${b.b}" style="width:${Math.min(u*100,100).toFixed(1)}%"></div></div>
      <div class="skm">${used.toLocaleString()} / ${interval.toLocaleString()} km</div></div>`;
  };

  document.getElementById('modal-services').innerHTML =
    svcBlock(oU,  `🛢️ Dvigatel Moyi — <em style="font-weight:400;font-size:11px">${curCar.oil_name}</em>`, curCar.total_km - curCar.oil_change_km, oi) +
    svcBlock(aU,  '🔵 Antifriz',    curCar.total_km - curCar.antifreeze_km,  curCar.antifreeze_interval  || 30000) +
    svcBlock(gU,  '🟢 Karobka',     curCar.total_km - curCar.gearbox_km,     curCar.gearbox_interval     || 50000) +
    svcBlock(afU, '💨 Havo Filtr',  curCar.total_km - (curCar.air_filter_km   || curCar.total_km), curCar.air_filter_interval   || 15000) +
    svcBlock(cfU, '🌬️ Salon Filtr', curCar.total_km - (curCar.cabin_filter_km || curCar.total_km), curCar.cabin_filter_interval || 15000) +
    svcBlock(ofU, '🔩 Moy Filtr',   curCar.total_km - (curCar.oil_filter_km   || curCar.total_km), curCar.oil_filter_interval   || 10000);

  document.getElementById('modal-km').value = curCar.total_km;
  renderOilSel('modal-oil-select', curCar.oil_name);

  const svcSel  = document.getElementById('modal-svc-type');
  const oilWrap = document.getElementById('modal-oil-wrap');
  oilWrap.style.display = svcSel.value === 'oil' ? '' : 'none';
  svcSel.onchange = () => { oilWrap.style.display = svcSel.value === 'oil' ? '' : 'none'; };

  loadHistory();
  const hint = document.getElementById('sms-hint');
  if (smsConfig.enabled && smsConfig.devsms_token) {
    hint.innerHTML = '💬 SMS yoqilgan — almashtirish bosilganda avtomatik yuboriladi';
    hint.style.display = 'block';
  } else hint.style.display = 'none';

  switchTab('info');
  document.getElementById('car-modal').classList.add('active');
}

function loadHistory() {
  const hist = curCar.history || [];
  const el   = document.getElementById('modal-history');
  if (!hist.length) { el.innerHTML = '<div class="empty"><div class="ei">📭</div><p>Tarix yo\'q</p></div>'; return; }
  const today = new Date().toDateString();
  el.innerHTML = [...hist].reverse().map(log => {
    const d   = new Date(log.date), isT = d.toDateString() === today;
    const m   = SVC_META[log.type] || { icon: '🔧', label: log.type };
    const ds  = isT ? '<span class="htlbl">Bugun ✅</span>' : d.toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const ts  = d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
    return `<div class="hi${isT ? ' htd' : ''}">
      <div class="hico">${m.icon}</div>
      <div>
        <div class="htype">${m.icon} ${m.label}${log.oil_name ? ' — ' + log.oil_name : ''}</div>
        <div class="hkm">🏁 ${log.km.toLocaleString()} km</div>
        <div class="hdate">${ds}${isT ? ' · ' + ts : ''}</div>
      </div>
    </div>`;
  }).join('');
}

function switchTab(name) {
  document.querySelectorAll('.tb').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.querySelectorAll('.tp').forEach(p => p.classList.toggle('active', p.id === name + '-tab'));
}
document.querySelectorAll('.tb').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
document.getElementById('modal-close').addEventListener('click', () => document.getElementById('car-modal').classList.remove('active'));
document.querySelector('.mo').addEventListener('click', () => document.getElementById('car-modal').classList.remove('active'));

// ===== CAR ACTIONS =====
document.getElementById('btn-update-km').addEventListener('click', () => {
  const km = parseInt(document.getElementById('modal-km').value);
  if (!km || km < 0) { showToast('❌ KM to\'g\'ri kiriting', 'error'); return; }
  curCar.total_km = km;
  allCars = allCars.map(c => c.id === curCar.id ? curCar : c); saveCars();
  showToast('✅ Probeg yangilandi!', 'success'); openModal(); loadDashboard();
});

document.getElementById('btn-change-svc').addEventListener('click', () => {
  const type    = document.getElementById('modal-svc-type').value;
  const oilName = document.getElementById('modal-oil-select').value || curCar.oil_name;
  const km      = parseInt(document.getElementById('modal-km').value) || curCar.total_km;

  curCar.total_km = km;
  const field = { oil:'oil_change_km', antifreeze:'antifreeze_km', gearbox:'gearbox_km',
                  air_filter:'air_filter_km', cabin_filter:'cabin_filter_km', oil_filter:'oil_filter_km' };
  if (field[type]) curCar[field[type]] = km;
  if (type === 'oil') curCar.oil_name = oilName;

  if (!curCar.history) curCar.history = [];
  curCar.history.push({ type, km, oil_name: type === 'oil' ? oilName : null, date: new Date().toISOString() });
  allCars = allCars.map(c => c.id === curCar.id ? curCar : c); saveCars();

  if (smsConfig.enabled && smsConfig.devsms_token) {
    const svcLabel = SVC_META[type]?.label || type;
    const tplKey   = type + '_message';
    const tmpl     = smsConfig[tplKey] || DEFAULT_SMS[tplKey] || DEFAULT_SMS.default_change_message;
    const filled   = fillTemplate(tmpl, curCar, type).replace(/{service_label}/g, svcLabel);
    sendSms(filled, curCar.phone_number);
    smsConfig.sms_sent_count = (smsConfig.sms_sent_count || 0) + 1; saveSms();
    showToast('✅ ' + svcLabel + ' · SMS yuborildi!', 'success');
  } else {
    showToast('✅ ' + (SVC_META[type]?.label || 'Xizmat') + ' almashtirildi!', 'success');
  }
  supabaseSaveServiceChange(curCar, type, km);
  openModal(); loadDashboard();
});

document.getElementById('btn-delete-car').addEventListener('click', () => {
  if (!confirm('Mashinani o\'chirasizmi?')) return;
  allCars = allCars.filter(c => c.id !== curCar.id); saveCars();
  document.getElementById('car-modal').classList.remove('active');
  showToast('✅ Mashina o\'chirildi!', 'success'); loadDashboard(); loadCarsGrid();
});

// ===== SETTINGS =====
document.getElementById('btn-settings').addEventListener('click', () => document.getElementById('settings-panel').classList.add('open'));
document.getElementById('close-settings').addEventListener('click', closeSettings);
document.getElementById('settings-overlay').addEventListener('click', closeSettings);
function closeSettings() { document.getElementById('settings-panel').classList.remove('open'); }

function saveThresholds() {
  const w = parseFloat(document.getElementById('setting-warn').value);
  const d = parseFloat(document.getElementById('setting-danger').value);
  WPCT = w/100; DPCT = d/100; cfg.warn_pct = w; cfg.danger_pct = d; saveCfg();
  showToast('✅ Saqlandi', 'success'); loadDashboard();
}
function exportData() {
  const a = document.createElement('a');
  a.href = 'data:application/json,' + encodeURIComponent(JSON.stringify({ cars: allCars, oils: allOils, sms: smsConfig, cfg }, null, 2));
  a.download = 'moytrack-backup.json'; a.click();
  showToast('✅ Eksport qilindi', 'success');
}
function confirmClear() {
  if (!confirm('Barcha ma\'lumotlarni o\'chirasizmi?')) return;
  ['cars','oils','_id_car','_id_oil'].forEach(k => localStorage.removeItem('mt_' + k));
  allCars = []; allOils = []; saveCars(); saveOils();
  showToast('✅ Tozalandi', 'success'); loadDashboard(); closeSettings();
}

// ===== TOAST =====
function showToast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.className = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ===== INIT =====
function init() {
  applyTheme();
  document.getElementById('setting-warn').value   = cfg.warn_pct;
  document.getElementById('setting-danger').value = cfg.danger_pct;
  if (!DB.get('oils_init', false)) { saveOils(); DB.set('oils_init', true); }
  loadDashboard();
  renderOilSel('oil-name');
  startAutoCheck();
}
init();
