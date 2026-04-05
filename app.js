// ================================================================
// MOYTRACK PRO v4.3  —  app.js
// Firebase Realtime DB: cars · oils · sms_config · service_logs
// ================================================================

const FIREBASE_URL = 'https://gilamuz-8308f-default-rtdb.firebaseio.com';

// ── BACKEND API URL ──────────────────────────────────────────────
// Avtomatik aniqlash: agar localhost bo'lsa — 3001 port,
// aks holda — joriy sayt manzili (production deploy uchun).
const BACKEND_URL = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? `http://${location.hostname}:3001`
  : `${location.protocol}//${location.host}`;

// ===== LOCAL DB =====
const DB = {
  get(k, d = []) { try { const v = localStorage.getItem('mt_' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v)      { try { localStorage.setItem('mt_' + k, JSON.stringify(v)); } catch(e) { console.warn(e); } },
  nextId(k)      { const id = this.get('_id_' + k, 0) + 1; this.set('_id_' + k, id); return id; }
};

// ===== FIREBASE REST API =====
const FB = {
  async get(path) {
    try {
      const r = await fetch(`${FIREBASE_URL}/${path}.json`);
      if (!r.ok) return { ok: false, status: r.status, data: null };
      const data = await r.json();
      return { ok: true, status: r.status, data };
    } catch(e) { return { ok: false, status: 0, error: e.message }; }
  },
  async put(path, body) {
    try {
      const r = await fetch(`${FIREBASE_URL}/${path}.json`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const data = await r.json().catch(() => null);
      return { ok: r.ok, status: r.status, data };
    } catch(e) { return { ok: false, status: 0, error: e.message }; }
  },
  async delete(path) {
    try {
      const r = await fetch(`${FIREBASE_URL}/${path}.json`, { method: 'DELETE' });
      return { ok: r.ok, status: r.status };
    } catch(e) { return { ok: false, status: 0, error: e.message }; }
  }
};

// ===== DEFAULT SMS =====
const DEFAULT_SMS = {
  save_message:            '{car_name} ({car_number}) saqlandi!\n📅 {date} {time}\n🔧 Almashtirildi: {services}\n🏁 Probeg: {km} km',
  oil_message:             '{car_name} ({car_number}) — dvigatel moyi: {oil_brand}\n📅 {date} {time} · 🏁 {km} km',
  gearbox_message:         '{car_name} ({car_number}) — karobka moyi yangilandi\n📅 {date} {time} · 🏁 {km} km',
  antifreeze_message:      '{car_name} ({car_number}) — antifriz yangilandi\n📅 {date} {time} · 🏁 {km} km',
  air_filter_message:      '{car_name} ({car_number}) — havo filtr almashtirildi\n📅 {date} {time} · 🏁 {km} km',
  cabin_filter_message:    '{car_name} ({car_number}) — salon filtr almashtirildi\n📅 {date} {time} · 🏁 {km} km',
  oil_filter_message:      '{car_name} ({car_number}) — moy filtr almashtirildi\n📅 {date} {time} · 🏁 {km} km',
  default_change_message:  '{car_name} ({car_number}) — {service_label} almashtirildi\n📅 {date} {time} · 🏁 {km} km',
};

// ===== STATE =====
let allCars = DB.get('cars', []);
let allOils = DB.get('oils', [
  { id: 1, name: 'SAE 5W-30',  interval: 10000 },
  { id: 2, name: 'SAE 5W-40',  interval: 7000  },
  { id: 3, name: 'SAE 10W-40', interval: 8000  }
]);
let smsConfig = DB.get('sms', {
  devsms_token: '', enabled: false, sms_sent_count: 0,
  firebase_enabled: true,
  ...DEFAULT_SMS
});
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

// ===== FIREBASE — YUKLASH =====
// Barcha ma'lumotlarni Firebase dan yuklaydi:
// cars, oils, sms_config
async function loadFromFirebase() {
  let changed = false;

  // — CARS —
  try {
    const r = await FB.get('cars');
    if (r.ok && r.data && typeof r.data === 'object') {
      const fbCars = Object.values(r.data).filter(Boolean).map(c => ({ ...c, id: Number(c.id) || c.id }));
      if (fbCars.length > 0) { allCars = fbCars; saveCars(); changed = true; }
    }
  } catch(e) { console.warn('Firebase cars:', e); }

  // — OILS —
  try {
    const r = await FB.get('oils');
    if (r.ok && r.data && typeof r.data === 'object') {
      const fbOils = Object.values(r.data).filter(Boolean).map(o => ({ ...o, id: Number(o.id) || o.id }));
      if (fbOils.length > 0) { allOils = fbOils; saveOils(); changed = true; }
    }
  } catch(e) { console.warn('Firebase oils:', e); }

  // — SMS CONFIG —
  try {
    const r = await FB.get('sms_config');
    if (r.ok && r.data && typeof r.data === 'object' && Object.keys(r.data).length > 0) {
      // DEFAULT_SMS ni asosiy qilib Firebase ma'lumotini ustiga qo'yamiz
      smsConfig = { ...DEFAULT_SMS, ...smsConfig, ...r.data };
      // firebase_enabled ni har doim true qilamiz
      smsConfig.firebase_enabled = true;
      saveSms();
      changed = true;
    }
  } catch(e) { console.warn('Firebase sms_config:', e); }

  if (changed) {
    loadDashboard();
    loadCarsGrid();
    renderOilSel('oil-name');
    // Agar SMS sahifasi ochiq bo'lsa — yangilash
    const smsPage = document.getElementById('sms');
    if (smsPage?.classList.contains('active')) loadSmsPage();
    // Agar oils sahifasi ochiq bo'lsa — yangilash
    const oilsPage = document.getElementById('oils');
    if (oilsPage?.classList.contains('active')) loadOilsPage();
  }
}

// ===== FIREBASE — SAQLASH =====

async function fbSaveCar(car) {
  if (!smsConfig.firebase_enabled) return;
  const r = await FB.put(`cars/car_${car.id}`, {
    id: car.id, car_name: car.car_name, car_number: car.car_number,
    phone_number: car.phone_number || '', total_km: car.total_km,
    oil_name: car.oil_name, daily_km: car.daily_km || 50,
    oil_change_km: car.oil_change_km,
    antifreeze_km: car.antifreeze_km, antifreeze_interval: car.antifreeze_interval || 30000,
    gearbox_km: car.gearbox_km,       gearbox_interval: car.gearbox_interval || 50000,
    air_filter_km: car.air_filter_km || car.total_km,     air_filter_interval: car.air_filter_interval || 15000,
    cabin_filter_km: car.cabin_filter_km || car.total_km, cabin_filter_interval: car.cabin_filter_interval || 15000,
    oil_filter_km: car.oil_filter_km || car.total_km,     oil_filter_interval: car.oil_filter_interval || 10000,
    history: car.history || [], added_at: car.added_at
  });
  if (r.ok) console.log('✅ FB cars: saqlandi', car.id);
  else      console.warn('⚠️ FB cars xato:', r.status, r.error);
}

async function fbDeleteCar(carId) {
  if (!smsConfig.firebase_enabled) return;
  const r = await FB.delete(`cars/car_${carId}`);
  if (r.ok) console.log('✅ FB cars: o\'chirildi', carId);
  else      console.warn('⚠️ FB cars delete xato:', r.status);
}

async function fbSaveServiceLog(car, type, km) {
  if (!smsConfig.firebase_enabled) return;
  const logId = `log_${Date.now()}`;
  const r = await FB.put(`service_logs/${logId}`, {
    car_name: car.car_name, car_number: car.car_number,
    service_type: type, km_at_change: km,
    changed_at: new Date().toISOString()
  });
  if (r.ok) console.log('✅ FB service_logs: saqlandi');
  else      console.warn('⚠️ FB service_logs xato:', r.status);
}

// ── OILS Firebase ga saqlash ──
async function fbSaveOil(oil) {
  if (!smsConfig.firebase_enabled) return;
  const r = await FB.put(`oils/oil_${oil.id}`, { id: oil.id, name: oil.name, interval: oil.interval });
  if (r.ok) console.log('✅ FB oils: saqlandi', oil.name);
  else      console.warn('⚠️ FB oils xato:', r.status);
}

async function fbDeleteOil(oilId) {
  if (!smsConfig.firebase_enabled) return;
  const r = await FB.delete(`oils/oil_${oilId}`);
  if (r.ok) console.log('✅ FB oils: o\'chirildi', oilId);
  else      console.warn('⚠️ FB oils delete xato:', r.status);
}

// ── SMS CONFIG Firebase ga saqlash ──
// ── SMS CONFIG saqlash — backend orqali (fallback: to'g'ridan Firebase) ──
async function fbSaveSmsConfig() {
  if (!smsConfig.firebase_enabled) return;

  const data = {
    devsms_token:            smsConfig.devsms_token            || '',
    enabled:                 smsConfig.enabled                 || false,
    sms_sent_count:          smsConfig.sms_sent_count          || 0,
    firebase_enabled:        true,
    save_message:            smsConfig.save_message            || DEFAULT_SMS.save_message,
    oil_message:             smsConfig.oil_message             || DEFAULT_SMS.oil_message,
    gearbox_message:         smsConfig.gearbox_message         || DEFAULT_SMS.gearbox_message,
    antifreeze_message:      smsConfig.antifreeze_message      || DEFAULT_SMS.antifreeze_message,
    air_filter_message:      smsConfig.air_filter_message      || DEFAULT_SMS.air_filter_message,
    cabin_filter_message:    smsConfig.cabin_filter_message    || DEFAULT_SMS.cabin_filter_message,
    oil_filter_message:      smsConfig.oil_filter_message      || DEFAULT_SMS.oil_filter_message,
    default_change_message:  smsConfig.default_change_message  || DEFAULT_SMS.default_change_message,
  };

  // ── 1) Backend orqali urinish ─────────────────────────────
  try {
    const r = await fetch(`${BACKEND_URL}/api/sms-config`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(data),
      signal:  AbortSignal.timeout(4000),
    });
    if (r.ok) {
      console.log('✅ Backend: sms_config saqlandi (Firebase ga ham yozildi)');
      return;
    }
  } catch (e) {
    console.warn('⚠️ Backend sms_config ishlamadi, fallback Firebase REST:', e.message);
  }

  // ── 2) Fallback: to'g'ridan Firebase REST ────────────────
  const r = await FB.put('sms_config', data);
  if (r.ok) console.log('✅ Firebase sms_config: saqlandi (fallback)');
  else      console.warn('⚠️ Firebase sms_config xato:', r.status, r.error);
}

// ── FIREBASE TEST ──
async function testFirebase() {
  const btn = document.getElementById('btn-test-firebase');
  const res = document.getElementById('firebase-test-result');
  btn.disabled  = true;
  btn.className = 'btn-test-supa loading';
  btn.innerHTML = '<span class="spin">⏳</span> Tekshirilmoqda...';
  res.style.display = 'block';
  res.className = 'supa-result loading';
  res.innerHTML = '⏳ Firebase ga ulanmoqda...';

  const result = await FB.get('_ping');

  if (result.status === 0) {
    btn.className = 'btn-test-supa fail';
    btn.innerHTML = '❌ Ulanmadi';
    res.className = 'supa-result fail';
    res.innerHTML = `❌ <strong>Firebase ga ulanib bo'lmadi!</strong><br>
      <span style="font-size:12px">Sabab: ${result.error || 'Tarmoq xatosi'}</span>`;
  } else {
    btn.className = 'btn-test-supa ok';
    btn.innerHTML = '✅ Done — Ulanish ishlayapti';
    res.className = 'supa-result ok';
    res.innerHTML = `✅ <strong>Done!</strong> Firebase ulanish muvaffaqiyatli.<br>
      <span style="font-size:12px">${FIREBASE_URL}</span>`;
    smsConfig.firebase_enabled = true;
    saveSms();
    // Ulanish muvaffaqiyatli — hozirgi ma'lumotlarni Firebase ga yuborish
    await syncAllToFirebase();
  }
  btn.disabled = false;
  setTimeout(() => {
    btn.className = 'btn-test-supa';
    btn.innerHTML = '🔗 Ulanishni Tekshirish';
    res.style.display = 'none';
  }, 8000);
}

// Barcha local ma'lumotlarni Firebase ga yuborish
async function syncAllToFirebase() {
  showToast('🔄 Firebase ga sinxronlamoqda...', 'success');
  // Cars
  for (const car of allCars) { await fbSaveCar(car); }
  // Oils
  for (const oil of allOils) { await fbSaveOil(oil); }
  // SMS config
  await fbSaveSmsConfig();
  showToast('✅ Firebase bilan sinxronlandi!', 'success');
}

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
  uel.innerHTML = [...uc,...wc].length
    ? [...uc,...wc].map(ciHTML).join('')
    : '<div class="empty"><div class="ei">🎉</div><p>Hammasi yaxshi!</p></div>';
  addCIE(uel);

  const ael = document.getElementById('all-cars-list');
  ael.innerHTML = allCars.length
    ? allCars.map(ciHTML).join('')
    : '<div class="empty"><div class="ei">🚗</div><p>Hali mashina qo\'shilmagan</p></div>';
  addCIE(ael);
}

function ciHTML(car) {
  const s  = carSt(car), oi = oilInt(car.oil_name);
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
    e.addEventListener('click', () => {
      curCar = allCars.find(c => String(c.id) === String(e.dataset.id));
      if (curCar) openModal();
    });
  });
}

// ===== CARS GRID =====
function loadCarsGrid(q = '') {
  const grid = document.getElementById('cars-grid');
  const f = q ? allCars.filter(c => c.car_number.toLowerCase().includes(q) || c.car_name.toLowerCase().includes(q)) : allCars;
  if (!f.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><div class="ei">${allCars.length ? '🔍' : '🚗'}</div><p>${allCars.length ? 'Topilmadi' : 'Mashinalar yo\'q'}</p></div>`;
    return;
  }
  grid.innerHTML = f.map(car => {
    const s  = carSt(car), oi = oilInt(car.oil_name);
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
    e.addEventListener('click', () => {
      curCar = allCars.find(c => String(c.id) === String(e.dataset.id));
      if (curCar) openModal();
    });
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
    interval = parseFloat(document.getElementById('antifreeze-interval')?.value) || 30000;
    kmFieldId = 'antifreeze-km'; hintId = 'antifreeze-hint'; pillHintId = 'anti-pill-hint';
  } else {
    interval = parseFloat(document.getElementById('gearbox-interval')?.value) || 50000;
    kmFieldId = 'gearbox-km'; hintId = 'gearbox-hint'; pillHintId = 'gear-pill-hint';
  }
  btn.closest('.pill-group').querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active-pill'));
  btn.classList.add('active-pill');
  const pct   = status === 'green' ? 0.2 : status === 'yellow' ? 0.8 : 1.05;
  const kmVal = Math.max(0, Math.round(km - interval * pct));
  document.getElementById(kmFieldId).value = kmVal;
  const labels = { green:['🟢','green','Yaxshi holat'], yellow:['🟡','yellow','Tez orada kerak'], red:['🔴','red','Hoziroq kerak!'] };
  const [icon, cls, text] = labels[status];
  setChip(pillHintId, cls, `${icon} ${text} · ${Math.max(0,km-kmVal).toLocaleString()} / ${interval.toLocaleString()} km`);
  calcChip(hintId, km, kmVal, interval);
}

// ===== HINT CHIPS =====
function setChip(id, cls, html) { const el = document.getElementById(id); if (!el) return; el.innerHTML = `<span class="sch ${cls}">${html}</span>`; }
function clearChip(id) { const el = document.getElementById(id); if (el) el.innerHTML = ''; }
function calcChip(hintId, totalKm, lastKm, interval) {
  if (!totalKm || !lastKm || !interval) { clearChip(hintId); return; }
  const u = (totalKm - lastKm) / interval, used = Math.max(0, totalKm - lastKm);
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
    calcChip('oil-hint', parseFloat(document.getElementById('current-km')?.value)||0, parseFloat(document.getElementById('oil-change-km')?.value)||0, oilInt(document.getElementById('oil-name')?.value));
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
  const svcList = checkedKeys.map(k => { const m = SVC_META[k]; return m ? `${m.icon} ${m.label}` : k; }).join(', ');
  return tmpl
    .replace(/{car_name}/g,   car.car_name)
    .replace(/{car_number}/g, car.car_number)
    .replace(/{km}/g,         car.total_km.toLocaleString())
    .replace(/{date}/g,        nowDate())
    .replace(/{time}/g,        nowTime())
    .replace(/{services}/g,    svcList || 'Ko\'rsatilmagan')
    .replace(/{oil_brand}/g,   car.oil_name || '—');
}

// ===== DEVSMS =====
// ── SMS YUBORISH — backend orqali (fallback: to'g'ridan-to'g'ri) ──
// BACKEND_URL ishlayotgan bo'lsa — /api/sms/send endpoint orqali ketadi.
// Aks holda to'g'ridan-to'g'ri devsms.uz ga murojaat qiladi.

async function sendSms(text, phone, logMeta = {}) {
  const token = smsConfig.devsms_token;
  if (!token || !phone) {
    console.log(`📤 SMS (token yo'q) → ${phone}\n${text}`);
    addSmsLog({ ok: false, phone, message: text, error: "Token yoki telefon raqam yo'q", ...logMeta });
    return { ok: false };
  }

  // ── 1) Backend orqali urinish ─────────────────────────────
  try {
    const r = await fetch(`${BACKEND_URL}/api/sms/send`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, phone, message: text }),
      signal:  AbortSignal.timeout(4000),
    });
    if (r.ok) {
      const data = await r.json().catch(() => ({}));
      console.log('📡 Backend SMS javob:', data);
      addSmsLog({ ok: true, phone, message: text, via: '🖥️ Backend', ...logMeta });
      return data;
    }
  } catch (e) {
    console.warn('⚠️ Backend SMS ishlamadi, fallback:', e.message);
  }

  // ── 2) Fallback: to'g'ridan-to'g'ri devsms.uz ───────────
  try {
    const r = await fetch('https://devsms.uz/api/send_sms.php', {
      method:  'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ phone: phone.replace(/\D/g, ''), message: text }),
    });
    const data = await r.json().catch(() => ({}));
    const isOk = r.ok || data?.status === 'success' || data?.message_id;
    console.log('DevSMS fallback javob:', data);
    addSmsLog({ ok: isOk, phone, message: text, via: '📡 DevSMS direct', error: isOk ? undefined : JSON.stringify(data), ...logMeta });
    return { ok: isOk, ...data };
  } catch (e) {
    console.warn('SMS xatosi (fallback):', e);
    addSmsLog({ ok: false, phone, message: text, error: e.message, ...logMeta });
    return { ok: false };
  }
}

// ===== SMS LOG TIZIMI =====
// Yuborilgan/xato SMS larni UI da ko'rsatish uchun
const SMS_LOG_KEY = 'sms_log';
const SMS_LOG_MAX = 50; // Maksimum 50 ta log saqlash

function addSmsLog(entry) {
  // entry: { ok, phone, message, service, car_name, error, via }
  const log = DB.get(SMS_LOG_KEY, []);
  log.unshift({
    ...entry,
    time: new Date().toLocaleString('uz-UZ'),
    ts: Date.now(),
  });
  // Maksimum hajmni saqlash
  if (log.length > SMS_LOG_MAX) log.splice(SMS_LOG_MAX);
  DB.set(SMS_LOG_KEY, log);
  // Agar SMS log paneli ochiq bo'lsa — yangilash
  renderSmsLog();
}

function renderSmsLog() {
  const el = document.getElementById('sms-log-list');
  if (!el) return;
  const log = DB.get(SMS_LOG_KEY, []);
  if (log.length === 0) {
    el.innerHTML = '<div class="sms-log-empty">📭 Hozircha SMS yuborilmagan</div>';
    return;
  }
  el.innerHTML = log.map(e => `
    <div class="sms-log-item ${e.ok ? 'sms-log-ok' : 'sms-log-fail'}">
      <div class="sms-log-header">
        <span class="sms-log-status">${e.ok ? '✅ Yuborildi' : '❌ Xato'}</span>
        <span class="sms-log-phone">📱 ${e.phone || '—'}</span>
        <span class="sms-log-time">🕐 ${e.time}</span>
        ${e.via ? `<span class="sms-log-via">${e.via}</span>` : ''}
      </div>
      ${e.car_name ? `<div class="sms-log-car">🚗 ${e.car_name}${e.service ? ' · ' + e.service : ''}</div>` : ''}
      <div class="sms-log-msg">${escHtml(e.message || '')}${e.error ? `\n❌ Xato: ${escHtml(e.error)}` : ''}</div>
    </div>
  `).join('');
}

function clearSmsLog() {
  DB.set(SMS_LOG_KEY, []);
  renderSmsLog();
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
        await sendSms(text, car.phone_number, { car_name: car.car_name, service: svcLabel + ' (avtomatik)' });
        markSentToday(car.id, svc.key);
        smsConfig.sms_sent_count = (smsConfig.sms_sent_count || 0) + 1;
        saveSms();
        await fbSaveSmsConfig();
      }
    }
  }
}
let autoCheckTimer = null;
function startAutoCheck() {
  if (autoCheckTimer) clearInterval(autoCheckTimer);
  autoCheckTimer = setInterval(autoCheckAndSend, AUTO_CHECK_INTERVAL);
}

// ===== ADD CAR =====
document.getElementById('add-car-form').addEventListener('submit', async e => {
  e.preventDefault();
  const km   = parseInt(document.getElementById('current-km').value) || 0;
  const name = document.getElementById('car-name').value.trim();
  const num  = document.getElementById('car-number').value.trim();
  const oil  = document.getElementById('oil-name').value;
  if (!name || !num || !oil) { showToast('❌ Barcha maydonlarni to\'ldiring', 'error'); return; }

  const car = {
    id: DB.nextId('car'), car_name: name, car_number: num,
    daily_km:             parseInt(document.getElementById('daily-km').value)              || 50,
    phone_number:         document.getElementById('phone-number').value.trim(),
    oil_name: oil, total_km: km,
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
    const key = el.dataset.key; checkedKeys.push(key);
    car.history.push({ type: key, km: car.total_km, oil_name: key === 'oil' ? oil : null, date: car.added_at });
    if (key === 'oil')          car.oil_change_km   = km;
    if (key === 'antifreeze')   car.antifreeze_km   = km;
    if (key === 'gearbox')      car.gearbox_km      = km;
    if (key === 'air_filter')   car.air_filter_km   = km;
    if (key === 'cabin_filter') car.cabin_filter_km = km;
    if (key === 'oil_filter')   car.oil_filter_km   = km;
  });

  allCars.push(car); saveCars();
  fbSaveCar(car); // Firebase ga saqlash

  if (smsConfig.enabled && smsConfig.devsms_token && car.phone_number) {
    // ── Backend orqali "mashina saqlash" SMS — Firebase dagi shablon bilan ──
    let smsSent = false;
    try {
      const r = await fetch(`${BACKEND_URL}/api/sms/car-saved`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          token:        smsConfig.devsms_token,
          car:          { ...car },
          checked_keys: checkedKeys,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json().catch(() => ({}));
      if (data.ok) {
        smsSent = true;
        console.log('📡 Backend car-saved SMS yuborildi:', data.text);
      }
    } catch(e) {
      console.warn('⚠️ Backend car-saved ishlamadi, fallback:', e.message);
    }

    // ── Fallback: local shablon bilan ──────────────────────────
    if (!smsSent) {
      const smsText = buildSaveSmsText(car, checkedKeys);
      await sendSms(smsText, car.phone_number);
    }

    smsConfig.sms_sent_count = (smsConfig.sms_sent_count || 0) + 1;
    saveSms(); fbSaveSmsConfig();
    showToast('✅ Saqlandi · SMS yuborildi!', 'success');
  } else {
    showToast('✅ Mashina qo\'shildi!', 'success');
  }
  resetAddCarForm(); navigateTo('cars');
});

// ===== OILS PAGE =====
function loadOilsPage() {
  const list = document.getElementById('oils-list');
  list.innerHTML = allOils.length
    ? allOils.map(o => `<div class="oi">
        <div><div class="on">🛢️ ${o.name}</div><div class="oint">📍 ${o.interval.toLocaleString()} km</div></div>
        <button class="odel" onclick="deleteOil(${o.id})">🗑️</button>
      </div>`).join('')
    : '<div class="empty"><div class="ei">🛢️</div><p>Hech qanday moy yo\'q</p></div>';
}
document.getElementById('add-oil-form').addEventListener('submit', e => {
  e.preventDefault();
  const name     = document.getElementById('oil-name-input').value.trim();
  const interval = parseInt(document.getElementById('oil-interval-input').value);
  if (!name || !interval) { showToast('❌ To\'ldiring', 'error'); return; }
  const oil = { id: DB.nextId('oil'), name, interval };
  allOils.push(oil); saveOils();
  fbSaveOil(oil); // ← Firebase ga saqlash
  showToast('✅ Moy turi qo\'shildi!', 'success');
  document.getElementById('add-oil-form').reset();
  loadOilsPage(); renderOilSel('oil-name');
});
function deleteOil(id) {
  if (!confirm('Moy turini o\'chirasizmi?')) return;
  allOils = allOils.filter(o => o.id !== id); saveOils();
  fbDeleteOil(id); // ← Firebase dan o'chirish
  showToast('✅ O\'chirildi!', 'success');
  loadOilsPage(); renderOilSel('oil-name');
}


// ===== SMS TAB TIZIMI =====
function switchSmsTab(tab, btn) {
  document.querySelectorAll('.sms-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.sms-tab-content').forEach(c => c.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById('sms-tab-' + tab);
  if (el) el.classList.add('active');
  // Log tabiga o'tganda yangilash
  if (tab === 'logs') renderSmsLog();
}

// Token ko'rish/yashirish
function toggleTokenVisibility() {
  const inp = document.getElementById('devsms-token');
  const eye = document.getElementById('token-eye');
  if (!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
  if (eye) eye.textContent = inp.type === 'password' ? '👁️' : '🙈';
}

// Token o'zgarganda eski natijani tozalaymiz
(function() {
  const tokenInp = document.getElementById('devsms-token');
  if (tokenInp) {
    tokenInp.addEventListener('input', () => {
      const resEl = document.getElementById('token-verify-result');
      if (resEl) resEl.style.display = 'none';
    });
  }
})();

// Backend va Firebase holatini tekshirish
async function checkBackendStatus() {
  const backendEl  = document.getElementById('sms-backend-status');
  const firebaseEl = document.getElementById('sms-firebase-status');
  if (backendEl)  { backendEl.textContent  = '⏳...'; backendEl.style.color  = 'var(--text2)'; }
  if (firebaseEl) { firebaseEl.textContent = '⏳...'; firebaseEl.style.color = 'var(--text2)'; }
  // Backend
  try {
    const r = await fetch(`${BACKEND_URL}/health`, { signal: AbortSignal.timeout(4000) });
    const d = await r.json().catch(() => ({}));
    if (backendEl) {
      backendEl.textContent  = r.ok ? '✅ Ulangan' : '❌ Xato';
      backendEl.style.color  = r.ok ? 'var(--success)' : 'var(--danger)';
    }
  } catch(e) {
    if (backendEl) { backendEl.textContent = '❌ Ulangan emas'; backendEl.style.color = 'var(--danger)'; }
  }
  // Firebase
  try {
    const r = await FB.get('_ping');
    if (firebaseEl) {
      firebaseEl.textContent = r.ok ? '✅ Ulangan' : '❌ Xato';
      firebaseEl.style.color = r.ok ? 'var(--success)' : 'var(--danger)';
    }
  } catch(e) {
    if (firebaseEl) { firebaseEl.textContent = '❌ Xato'; firebaseEl.style.color = 'var(--danger)'; }
  }
}

// Tezkor SMS yuborish
async function quickSendSms() {
  const phone   = document.getElementById('quick-sms-phone')?.value?.trim();
  const message = document.getElementById('quick-sms-text')?.value?.trim();
  const resultEl = document.getElementById('quick-sms-result');

  if (!smsConfig.devsms_token) {
    showTmplResult(resultEl, 'fail', '❌ Avval DevSMS token kiriting (Sozlama tabidan)');
    return;
  }
  if (!phone) { showTmplResult(resultEl, 'fail', '❌ Telefon raqam kiriting'); return; }
  if (!message) { showTmplResult(resultEl, 'fail', '❌ Xabar matni kiriting'); return; }

  showTmplResult(resultEl, 'loading', `⏳ ${phone} ga yuborilmoqda...`);
  try {
    const r = await fetch(`${BACKEND_URL}/api/sms/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: smsConfig.devsms_token, phone, message }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json().catch(() => ({}));
    if (data.ok) {
      showTmplResult(resultEl, 'ok', `✅ SMS yuborildi → ${phone}\n<div class="preview">${escHtml(message)}</div>`);
      addSmsLog({ ok: true, phone, message, via: '⚡ Tezkor' });
      smsConfig.sms_sent_count = (smsConfig.sms_sent_count || 0) + 1;
      saveSms(); updateSmsStats();
      document.getElementById('quick-sms-text').value = '';
    } else {
      showTmplResult(resultEl, 'fail', `❌ Xato: ${data.error || JSON.stringify(data.devsms || {})}`);
      addSmsLog({ ok: false, phone, message, via: '⚡ Tezkor', error: data.error });
    }
  } catch(e) {
    // Fallback
    const res = await sendSms(message, phone, { via: '⚡ Tezkor (fallback)' });
    if (res?.ok !== false) {
      showTmplResult(resultEl, 'ok', `✅ SMS yuborildi (fallback) → ${phone}`);
    } else {
      showTmplResult(resultEl, 'fail', `❌ ${e.message || 'SMS yuborilmadi'}`);
    }
  }
}

// SMS statistikasini yangilash
function updateSmsStats() {
  const log = DB.get(SMS_LOG_KEY, []);
  const today = new Date().toDateString();
  const todayCount = log.filter(e => new Date(e.ts || 0).toDateString() === today).length;
  const failCount  = log.filter(e => !e.ok).length;
  const sentEl  = document.getElementById('sms-sent-count');
  const todayEl = document.getElementById('sms-stat-today');
  const failEl  = document.getElementById('sms-stat-fail');
  if (sentEl)  sentEl.textContent  = (smsConfig.sms_sent_count || 0).toLocaleString();
  if (todayEl) todayEl.textContent = todayCount;
  if (failEl)  failEl.textContent  = failCount;
}

// SMS page header status
function updateSmsHeaderStatus() {
  const el = document.getElementById('sms-header-status');
  if (!el) return;
  if (smsConfig.enabled && smsConfig.devsms_token) {
    el.textContent = '✅ SMS faol — ' + (smsConfig.sms_sent_count || 0) + ' ta yuborilgan';
    el.style.color = 'var(--success)';
  } else if (!smsConfig.devsms_token) {
    el.textContent = '⚠️ Token kiritilmagan';
    el.style.color = 'var(--warning)';
  } else {
    el.textContent = '❌ SMS o\'chirilgan';
    el.style.color = 'var(--danger)';
  }
}

// Token tekshirish
async function verifyToken() {
  const token  = document.getElementById('devsms-token')?.value?.trim();
  const resEl  = document.getElementById('token-verify-result');
  const btn    = document.querySelector('[onclick="verifyToken()"]');
  if (!token) { showTmplResult(resEl, 'fail', '❌ Token kiriting'); return; }
  showTmplResult(resEl, 'loading', '⏳ Token tekshirilmoqda...');
  if (btn) setBtnState(btn, 'loading', '⏳ Tekshirilmoqda...');

  function fmtBalance(balance) {
    if (balance === null || balance === undefined || balance === '') return '';
    return ` · 💰 Balans: ${Number(balance).toLocaleString()} so'm`;
  }

  function resetBtn() {
    if (btn) setBtnState(btn, '', '🔍 Token Tekshirish');
  }

  try {
    const r = await fetch(`${BACKEND_URL}/api/sms/verify-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(10000),
    });
    const d = await r.json().catch(() => ({}));
    resetBtn();
    if (d.ok) {
      showTmplResult(resEl, 'ok', `✅ Token to'g'ri${fmtBalance(d.balance)}`);
    } else {
      const hint = d.http_status ? ` (HTTP ${d.http_status})` : '';
      showTmplResult(resEl, 'fail', `❌ Token xato yoki muddati o'tgan${hint}`);
    }
  } catch(e) {
    resetBtn();
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      showTmplResult(resEl, 'fail', `❌ Vaqt tugadi — backend server ishlamayapti`);
    } else {
      showTmplResult(resEl, 'fail', `❌ Backend bilan bog'lanib bo'lmadi`);
    }
  }
}

// SMS PAGE =====
function loadSmsPage() {
  document.getElementById('devsms-token').value        = smsConfig.devsms_token  || '';
  document.getElementById('sms-enabled').checked       = !!smsConfig.enabled;
  const fbUrlEl = document.getElementById('firebase-url-display');
  if (fbUrlEl) fbUrlEl.textContent = FIREBASE_URL;
  const fbEnEl = document.getElementById('firebase-enabled');
  if (fbEnEl) fbEnEl.checked = !!smsConfig.firebase_enabled;
  document.getElementById('sms-save-message').value         = smsConfig.save_message         || DEFAULT_SMS.save_message;
  document.getElementById('sms-oil-message').value          = smsConfig.oil_message          || DEFAULT_SMS.oil_message;
  document.getElementById('sms-gearbox-message').value      = smsConfig.gearbox_message      || DEFAULT_SMS.gearbox_message;
  document.getElementById('sms-antifreeze-message').value   = smsConfig.antifreeze_message   || DEFAULT_SMS.antifreeze_message;
  document.getElementById('sms-air-filter-message').value   = smsConfig.air_filter_message   || DEFAULT_SMS.air_filter_message;
  document.getElementById('sms-cabin-filter-message').value = smsConfig.cabin_filter_message || DEFAULT_SMS.cabin_filter_message;
  document.getElementById('sms-oil-filter-message').value   = smsConfig.oil_filter_message   || DEFAULT_SMS.oil_filter_message;
  document.getElementById('sms-sent-count').textContent = (smsConfig.sms_sent_count || 0).toLocaleString();

  // Test telefon raqamini yuklash
  const testPhoneVal = smsConfig.test_phone || DB.get('test_phone', '');
  const tpInput = document.getElementById('test-phone-input');
  if (tpInput) tpInput.value = testPhoneVal;
  const tpStatus = document.getElementById('test-phone-status');
  if (tpStatus) {
    tpStatus.textContent = testPhoneVal
      ? `✅ Test SMS ${testPhoneVal} ga yuboriladi`
      : '⚠️ Raqam kiritilmagan — test SMS yuborilmaydi';
    tpStatus.style.color = testPhoneVal ? 'var(--success)' : 'var(--text2)';
  }

  const ae = document.getElementById('sms-api-status');
  if (ae) {
    ae.textContent = smsConfig.devsms_token ? '✅ Token kiritilgan' : '❌ Token kiritilmagan';
    ae.style.color = smsConfig.devsms_token ? 'var(--success)' : 'var(--danger)';
  }

  const card = document.getElementById('sms-status-card');
  const el   = document.getElementById('sms-status');
  if (smsConfig.enabled && smsConfig.devsms_token) { el.textContent = '✅ SMS faol'; card.classList.add('on'); }
  else if (!smsConfig.devsms_token)                { el.textContent = '⚠️ DevSMS token kiritilmagan'; card.classList.remove('on'); }
  else                                              { el.textContent = '❌ SMS o\'chirilgan'; card.classList.remove('on'); }

  updateSmsStats();
  updateSmsHeaderStatus();
  // Backend va Firebase holatini asinxron tekshiramiz
  setTimeout(checkBackendStatus, 300);
}
document.getElementById('sms-config-form').addEventListener('submit', async e => {
  e.preventDefault();
  const saveBtn = e.target.querySelector('[type="submit"]');

  // ── Loading holati ──
  if (saveBtn) setBtnState(saveBtn, 'loading', '⏳ Saqlanmoqda...');

  smsConfig.devsms_token         = document.getElementById('devsms-token').value.trim();
  smsConfig.enabled              = document.getElementById('sms-enabled').checked;
  smsConfig.firebase_enabled     = document.getElementById('firebase-enabled')?.checked ?? true;
  smsConfig.save_message         = document.getElementById('sms-save-message').value;
  smsConfig.oil_message          = document.getElementById('sms-oil-message').value;
  smsConfig.gearbox_message      = document.getElementById('sms-gearbox-message').value;
  smsConfig.antifreeze_message   = document.getElementById('sms-antifreeze-message').value;
  smsConfig.air_filter_message   = document.getElementById('sms-air-filter-message').value;
  smsConfig.cabin_filter_message = document.getElementById('sms-cabin-filter-message').value;
  smsConfig.oil_filter_message   = document.getElementById('sms-oil-filter-message').value;

  // ── Lokal saqlash ──
  saveSms();

  // ── Firebase ga saqlash (async, xato bo'lsa ham davom etadi) ──
  try {
    await fbSaveSmsConfig();
  } catch(err) {
    console.warn('Firebase saqlashda xato:', err);
  }

  startAutoCheck();

  // ── Token bo'lsa — balansni avtomatik tekshiramiz ──
  if (smsConfig.devsms_token) {
    const resEl = document.getElementById('token-verify-result');
    if (resEl) {
      showTmplResult(resEl, 'loading', '⏳ Token tekshirilmoqda...');
      // Orqa fonda tekshiramiz (bloklamaslik uchun)
      verifyToken().catch(() => {});
    }
  }

  // ── Tugmani tiklash ──
  if (saveBtn) {
    setBtnState(saveBtn, 'ok', '✅ Saqlandi!');
    setTimeout(() => setBtnState(saveBtn, '', '✅ Saqlash va Ishga Tushurish'), 2500);
  }

  showToast('✅ SMS sozlamalari saqlandi!', 'success');
  loadSmsPage();
});
function resetSmsCount() {
  if (!confirm('Hisoblagichni nolga tiklaysizmi?')) return;
  smsConfig.sms_sent_count = 0; saveSms();
  fbSaveSmsConfig(); // ← Firebase ga yangilash

  showToast('✅ Tiklandi', 'success'); loadSmsPage();
}

// ===== SHABLON: ALOHIDA SAQLASH =====
// Har bir shablon yonidagi "💾 Shablonni saqlash" tugmasi
// shu funksiyani chaqiradi. Backend ga saqlaydi → Firebase ga yozadi.
async function saveTemplate(templateKey, textareaId) {
  const btn = document.querySelector(`[onclick="saveTemplate('${templateKey}','${textareaId}')"]`);
  const resultEl = document.getElementById('tmpl-result-' + templateKey);
  const value = document.getElementById(textareaId)?.value?.trim();

  if (!value) {
    showTmplResult(resultEl, 'fail', "❌ Shablon bo'sh — matn kiriting");
    return;
  }

  // Tugmani loading holatiga o'tkaz
  setBtnState(btn, 'loading', '⏳ Saqlanmoqda...');
  showTmplResult(resultEl, 'loading', '⏳ Backend ga yuborilmoqda...');

  // Local state ga yoz
  smsConfig[templateKey] = value;
  saveSms();

  // Backend → Firebase ga saqlash
  let savedViaBackend = false;
  try {
    const payload = { ...smsConfig };
    payload[templateKey] = value;

    const r = await fetch(`${BACKEND_URL}/api/sms-config`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(5000),
    });
    if (r.ok) {
      const data = await r.json();
      savedViaBackend = true;
      setBtnState(btn, 'ok', '✅ Saqlandi');
      showTmplResult(resultEl, 'ok',
        `✅ Shablon backend + Firebase ga saqlandi.
` +
        `<div class="preview">${escHtml(value)}</div>`
      );
    } else {
      throw new Error('Backend ' + r.status);
    }
  } catch(e) {
    // Fallback: to'g'ridan Firebase REST
    const fbR = await FB.put('sms_config', { ...smsConfig });
    if (fbR.ok) {
      setBtnState(btn, 'ok', '✅ Saqlandi (Firebase)');
      showTmplResult(resultEl, 'ok',
        `✅ Shablon Firebase ga saqlandi (backend yo'q — fallback).
` +
        `<div class="preview">${escHtml(value)}</div>`
      );
    } else {
      setBtnState(btn, 'fail', '❌ Xato');
      showTmplResult(resultEl, 'fail', '❌ Saqlashda xato: ' + (e.message || "noma'lum"));
    }
  }
  setTimeout(() => { setBtnState(btn, '', '💾 Shablonni saqlash'); }, 3000);
}

// ===== SHABLON: TEST SMS YUBORISH =====
// Har bir shablon yonidagi "📤 Test SMS" tugmasi
// backend dan joriy saqlangan shablonni olib, test uchun SMS yuboradi.
async function testTemplate(templateKey, textareaId) {
  const btn = document.querySelector(`[onclick="testTemplate('${templateKey}','${textareaId}')"]`);
  const resultEl = document.getElementById('tmpl-result-' + templateKey);

  // Token tekshir
  if (!smsConfig.devsms_token) {
    showTmplResult(resultEl, 'fail', "❌ Avval DevSMS token kiriting va saqlang");
    return;
  }

  // Test uchun telefon raqami — avval saqlangan test raqami, keyin birinchi mashina
  const testPhone = getTestPhone() || allCars.find(c => c.phone_number)?.phone_number;
  if (!testPhone) {
    showTmplResult(resultEl, 'fail', '❌ Test raqam yo\'q — SMS sahifasining tepasidan kiriting va saqlang');
    return;
  }

  // Textarea dagi joriy matnni avval saqlaymiz (saqlashdan so'ng test qilish)
  const currentText = document.getElementById(textareaId)?.value?.trim();
  if (!currentText) {
    showTmplResult(resultEl, 'fail', "❌ Shablon bo'sh — matn kiriting");
    return;
  }

  setBtnState(btn, 'loading', '⏳ Yuborilmoqda...');
  showTmplResult(resultEl, 'loading', `⏳ ${testPhone} raqamiga test SMS yuborilmoqda...`);

  // Backend orqali test
  try {
    const testCar = allCars.find(c => c.phone_number) || {
      car_name: 'Test Nexia', car_number: '01A 000AA',
      total_km: 85000, oil_name: 'SAE 5W-30', phone_number: testPhone
    };

    const r = await fetch(`${BACKEND_URL}/api/sms/test`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        token:        smsConfig.devsms_token,
        phone:        testPhone,
        template_key: templateKey,
        template_override: currentText,  // textarea dagi joriy matn
        car:          testCar,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json().catch(() => ({}));

    if (data.ok) {
      setBtnState(btn, 'ok', '✅ Yuborildi');
      showTmplResult(resultEl, 'ok',
        `✅ Test SMS yuborildi → ${testPhone}
` +
        `<div class="preview">${escHtml(data.text || currentText)}</div>`
      );
    } else {
      setBtnState(btn, 'fail', '❌ Xato');
      showTmplResult(resultEl, 'fail',
        `❌ SMS yuborilmadi: ${data.error || JSON.stringify(data.devsms || {})}`
      );
    }
  } catch(e) {
    // Fallback: to'g'ridan devsms
    const svcType  = templateKey.replace('_message','');
    const svcLabel = SVC_META[svcType]?.label || svcType;
    const text = currentText
      .replace(/{car_name}/g,      allCars[0]?.car_name   || 'Test Nexia')
      .replace(/{car_number}/g,    allCars[0]?.car_number || '01A 000AA')
      .replace(/{km}/g,            (allCars[0]?.total_km  || 85000).toLocaleString())
      .replace(/{date}/g,           nowDate())
      .replace(/{time}/g,           nowTime())
      .replace(/{oil_brand}/g,      allCars[0]?.oil_name  || 'SAE 5W-30')
      .replace(/{services}/g,       svcLabel)
      .replace(/{service_label}/g,  svcLabel);

    const smsR = await sendSms(text, testPhone);
    if (smsR && smsR.ok !== false) {
      setBtnState(btn, 'ok', '✅ Yuborildi');
      showTmplResult(resultEl, 'ok',
        `✅ Test SMS yuborildi (fallback) → ${testPhone}
<div class="preview">${escHtml(text)}</div>`
      );
    } else {
      setBtnState(btn, 'fail', '❌ Xato');
      showTmplResult(resultEl, 'fail', `❌ Xato: ${e.message || 'SMS yuborilmadi'}`);
    }
  }
  setTimeout(() => { setBtnState(btn, '', '📤 Test SMS'); }, 5000);
}

// ── Yordamchi: tugma holati ─────────────────────────────────────
function setBtnState(btn, cls, label) {
  if (!btn) return;
  btn.className = btn.className.replace(/\b(loading|ok|fail)\b/g, '').trim();
  if (cls) btn.classList.add(cls);
  btn.innerHTML = label;
  btn.disabled  = cls === 'loading';
}

// ── Yordamchi: natija paneli ────────────────────────────────────
function showTmplResult(el, cls, html) {
  if (!el) return;
  el.className   = 'tmpl-result ' + cls;
  el.innerHTML   = html;
  el.style.display = 'block';
  setTimeout(() => { if (cls !== 'loading') el.style.display = 'none'; }, 7000);
}

// ── Yordamchi: HTML escape ──────────────────────────────────────
function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ================================================================
// TEST TELEFON RAQAMI
// ================================================================

/** Saqlangan test raqamini qaytaradi */
function getTestPhone() {
  return smsConfig.test_phone || DB.get('test_phone', '');
}

/** Test raqamini saqlaydi — local + Firebase */
async function saveTestPhone() {
  const input = document.getElementById('test-phone-input');
  const btn   = document.getElementById('btn-save-test-phone');
  const status = document.getElementById('test-phone-status');
  const phone = input?.value?.trim();

  if (!phone) {
    status.textContent = '❌ Raqam kiriting';
    status.style.color = 'var(--danger)';
    return;
  }

  btn.classList.add('loading');
  btn.textContent = '⏳...';

  smsConfig.test_phone = phone;
  DB.set('test_phone', phone);
  saveSms();

  try {
    await fetch(`${BACKEND_URL}/api/sms-config`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(smsConfig),
      signal:  AbortSignal.timeout(4000),
    });
  } catch(e) {
    await FB.put('sms_config', smsConfig);
  }

  btn.classList.remove('loading');
  btn.classList.add('ok');
  btn.textContent = '✅ Saqlandi';
  status.textContent = `✅ Test SMS ${phone} raqamiga yuboriladi`;
  status.style.color = 'var(--success)';
  setTimeout(() => {
    btn.classList.remove('ok');
    btn.textContent = '💾 Saqlash';
  }, 3000);
}

// ================================================================
// SHABLON EDITOR MODAL
// ================================================================

let _editorKey  = '';   // faol template key
let _editorTaId = '';   // manbaa textarea id

/** Editorni ochadi */
function openEditor(templateKey, textareaId, title) {
  _editorKey  = templateKey;
  _editorTaId = textareaId;

  const sourceVal = document.getElementById(textareaId)?.value ||
                    smsConfig[templateKey] || DEFAULT_SMS[templateKey] || '';

  document.getElementById('emod-title').textContent    = title || 'Shablonni Tahrirlash';
  document.getElementById('emod-textarea').value       = sourceVal;
  document.getElementById('emod-result').style.display = 'none';

  updateEditorPreview();

  const modal = document.getElementById('editor-modal');
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';

  // Textarea ni kattalashtir va focuslash
  setTimeout(() => document.getElementById('emod-textarea')?.focus(), 80);
}

/** Editorni yopadi — o'zgarishlarni asosiy textareaga ko'chiradi */
function closeEditor() {
  const modal = document.getElementById('editor-modal');
  if (!modal) return;
  modal.style.display = 'none';
  document.body.style.overflow = '';

  // Asosiy textarea ga ko'chirish
  const edVal = document.getElementById('emod-textarea')?.value;
  if (_editorTaId && edVal !== undefined) {
    const ta = document.getElementById(_editorTaId);
    if (ta) ta.value = edVal;
  }
  _editorKey = _editorTaId = '';
}

/** Preview ni real vaqtda yangilab turadi */
function updateEditorPreview() {
  const tmpl = document.getElementById('emod-textarea')?.value || '';
  const car  = allCars[0] || {
    car_name: 'Nexia 3', car_number: '01A 123BC',
    total_km: 85000, oil_name: 'SAE 5W-30'
  };
  const svcType  = _editorKey.replace('_message', '');
  const svcLabel = SVC_META[svcType]?.label || svcType || 'Xizmat';
  const preview  = tmpl
    .replace(/{car_name}/g,     car.car_name)
    .replace(/{car_number}/g,   car.car_number)
    .replace(/{km}/g,           (car.total_km||0).toLocaleString())
    .replace(/{date}/g,          nowDate())
    .replace(/{time}/g,          nowTime())
    .replace(/{oil_brand}/g,     car.oil_name || 'SAE 5W-30')
    .replace(/{services}/g,      svcLabel)
    .replace(/{service_label}/g, svcLabel);
  const prev = document.getElementById('emod-preview');
  if (prev) prev.textContent = preview || '—';
}

// Editor textarea o'zgarganda preview yangilanadi
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('emod-textarea')?.addEventListener('input', updateEditorPreview);
});
// DOMContentLoaded kutmasdan ham ishlashi uchun (skript oxirida chaqiriladi)
(function setupEditorListener() {
  const ta = document.getElementById('emod-textarea');
  if (ta) ta.addEventListener('input', updateEditorPreview);
})();

/** O'zgaruvchini kursorga qo'yadi */
function insertVar(varStr) {
  const ta = document.getElementById('emod-textarea');
  if (!ta) return;
  const start = ta.selectionStart;
  const end   = ta.selectionEnd;
  const val   = ta.value;
  ta.value = val.slice(0, start) + varStr + val.slice(end);
  ta.selectionStart = ta.selectionEnd = start + varStr.length;
  ta.focus();
  updateEditorPreview();
}

/** Shablonni default ga qaytaradi */
function resetEditorToDefault() {
  if (!_editorKey) return;
  const def = DEFAULT_SMS[_editorKey] || '';
  document.getElementById('emod-textarea').value = def;
  updateEditorPreview();
}

/** Editordan saqlash */
async function editorSave() {
  const btn   = document.getElementById('emod-btn-save');
  const resEl = document.getElementById('emod-result');
  const value = document.getElementById('emod-textarea')?.value?.trim();

  if (!value) {
    showTmplResult(resEl, 'fail', '❌ Shablon bo\u02BCsh');
    return;
  }

  setBtnState(btn, 'loading', '⏳ Saqlanmoqda...');

  // Asosiy textarea ga ham yoz
  if (_editorTaId) {
    const ta = document.getElementById(_editorTaId);
    if (ta) ta.value = value;
  }

  // smsConfig ga yoz
  smsConfig[_editorKey] = value;
  saveSms();

  // Backend/Firebase ga saqlash
  let ok = false;
  try {
    const r = await fetch(`${BACKEND_URL}/api/sms-config`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(smsConfig),
      signal:  AbortSignal.timeout(5000),
    });
    ok = r.ok;
  } catch(e) {
    const fbR = await FB.put('sms_config', smsConfig);
    ok = fbR.ok;
  }

  if (ok) {
    setBtnState(btn, 'ok', '✅ Saqlandi');
    showTmplResult(resEl, 'ok', '✅ Shablon saqlandi va Firebase ga yuborildi');
    setTimeout(() => closeEditor(), 1200);
  } else {
    setBtnState(btn, 'fail', '❌ Xato');
    showTmplResult(resEl, 'fail', '❌ Saqlashda xato yuz berdi');
  }
  setTimeout(() => setBtnState(btn, '', '💾 Saqlash'), 3000);
}

/** Editordan Test SMS yuborish */
async function editorTestSms() {
  const btn   = document.getElementById('emod-btn-test');
  const resEl = document.getElementById('emod-result');

  if (!smsConfig.devsms_token) {
    showTmplResult(resEl, 'fail', '❌ DevSMS token kiritilmagan');
    return;
  }

  const testPhone = getTestPhone() || allCars.find(c => c.phone_number)?.phone_number;
  if (!testPhone) {
    showTmplResult(resEl, 'fail', '❌ Test raqam yo\u02BCq — tepadan kiriting va saqlang');
    return;
  }

  const currentText = document.getElementById('emod-textarea')?.value?.trim();
  if (!currentText) {
    showTmplResult(resEl, 'fail', '❌ Shablon bo\u02BCsh');
    return;
  }

  setBtnState(btn, 'loading', '⏳ Yuborilmoqda...');
  showTmplResult(resEl, 'loading', `⏳ ${testPhone} ga yuborilmoqda...`);

  try {
    const testCar = allCars.find(c => c.phone_number) || {
      car_name: 'Test Nexia', car_number: '01A 000AA',
      total_km: 85000, oil_name: 'SAE 5W-30'
    };

    const r = await fetch(`${BACKEND_URL}/api/sms/test`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        token:             smsConfig.devsms_token,
        phone:             testPhone,
        template_key:      _editorKey,
        template_override: currentText,
        car:               testCar,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await r.json().catch(() => ({}));

    if (data.ok) {
      setBtnState(btn, 'ok', '✅ Yuborildi');
      showTmplResult(resEl, 'ok',
        `✅ Test SMS yuborildi → ${testPhone}\n` +
        `<div class="preview">${escHtml(data.text || currentText)}</div>`
      );
    } else {
      setBtnState(btn, 'fail', '❌ Xato');
      showTmplResult(resEl, 'fail',
        `❌ ${data.error || JSON.stringify(data.devsms || 'SMS yuborilmadi')}`
      );
    }
  } catch(e) {
    // Fallback
    const svcType  = _editorKey.replace('_message','');
    const svcLabel = SVC_META[svcType]?.label || svcType;
    const car = allCars[0] || { car_name:'Test', car_number:'01A', total_km:0, oil_name:'SAE' };
    const text = currentText
      .replace(/{car_name}/g,     car.car_name)
      .replace(/{car_number}/g,   car.car_number)
      .replace(/{km}/g,           (car.total_km||0).toLocaleString())
      .replace(/{date}/g,          nowDate())
      .replace(/{time}/g,          nowTime())
      .replace(/{oil_brand}/g,     car.oil_name)
      .replace(/{services}/g,      svcLabel)
      .replace(/{service_label}/g, svcLabel);
    const smsR = await sendSms(text, testPhone);
    if (smsR?.ok !== false) {
      setBtnState(btn, 'ok', '✅ Yuborildi');
      showTmplResult(resEl, 'ok',
        `✅ Yuborildi (fallback) → ${testPhone}\n<div class="preview">${escHtml(text)}</div>`
      );
    } else {
      setBtnState(btn, 'fail', '❌ Xato');
      showTmplResult(resEl, 'fail', `❌ ${e.message || 'SMS yuborilmadi'}`);
    }
  }
  setTimeout(() => setBtnState(btn, '', '📤 Test SMS'), 5000);
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
  const svcSel = document.getElementById('modal-svc-type');
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
    const d = new Date(log.date), isT = d.toDateString() === today;
    const m = SVC_META[log.type] || { icon: '🔧', label: log.type };
    const ds = isT ? '<span class="htlbl">Bugun ✅</span>' : d.toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const ts = d.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
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
  fbSaveCar(curCar); // ← Firebase yangilash
  showToast('✅ Probeg yangilandi!', 'success'); openModal(); loadDashboard();
});

document.getElementById('btn-change-svc').addEventListener('click', async () => {
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

  fbSaveCar(curCar);           // ← Firebase mashina yangilash
  fbSaveServiceLog(curCar, type, km); // ← Firebase xizmat log

  if (smsConfig.enabled && smsConfig.devsms_token) {
    const svcLabel = SVC_META[type]?.label || type;

    // ── Backend orqali SMS yuborish — shablon Firebase dagi versiyadan olinadi ──
    let smsSent = false;
    try {
      const r = await fetch(`${BACKEND_URL}/api/sms/service-change`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          token:        smsConfig.devsms_token,
          car:          { ...curCar },
          service_type: type,
        }),
        signal: AbortSignal.timeout(8000),
      });
      const data = await r.json().catch(() => ({}));
      if (data.ok) {
        smsSent = true;
        console.log('📡 Backend service-change SMS yuborildi:', data.text);
      } else {
        console.warn('⚠️ Backend SMS xato:', data.error);
      }
    } catch(e) {
      console.warn('⚠️ Backend ishlamadi, fallback:', e.message);
    }

    // ── Fallback: local shablon bilan to'g'ridan ──────────────
    if (!smsSent) {
      const tplKey = type + '_message';
      const tmpl   = smsConfig[tplKey] || DEFAULT_SMS[tplKey] || DEFAULT_SMS.default_change_message;
      const filled = fillTemplate(tmpl, curCar, type).replace(/{service_label}/g, svcLabel);
      await sendSms(filled, curCar.phone_number);
    }

    smsConfig.sms_sent_count = (smsConfig.sms_sent_count || 0) + 1;
    saveSms(); fbSaveSmsConfig();
    showToast('✅ ' + svcLabel + ' · SMS yuborildi!', 'success');
  } else {
    showToast('✅ ' + (SVC_META[type]?.label || 'Xizmat') + ' almashtirildi!', 'success');
  }
  openModal(); loadDashboard();
});

document.getElementById('btn-delete-car').addEventListener('click', () => {
  if (!confirm('Mashinani o\'chirasizmi?')) return;
  fbDeleteCar(curCar.id); // ← Firebase dan o'chirish
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
  // 1) LocalStorage dan tez ko'rsatish
  loadDashboard();
  renderOilSel('oil-name');
  // 2) Firebase dan yangilash (orqa fonda)
  loadFromFirebase();
  startAutoCheck();
}
init();
