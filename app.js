// ============================================================
// MOYTRACK PRO v3.2 — app.js
// LocalStorage · Pill belgisi · SMS Analytics & Jurnal
// ============================================================

// ========== DATABASE ==========
const DB = {
  get(key, def = []) {
    try { const v = localStorage.getItem('mt_' + key); return v ? JSON.parse(v) : def; }
    catch { return def; }
  },
  set(key, val) {
    try { localStorage.setItem('mt_' + key, JSON.stringify(val)); }
    catch (e) { console.warn('Storage full', e); }
  },
  nextId(key) {
    const id = this.get('_id_' + key, 0) + 1;
    this.set('_id_' + key, id);
    return id;
  }
};

// ========== STATE ==========
let allCars   = DB.get('cars', []);
let allOils   = DB.get('oils', [
  { id: 1, name: 'SAE 5W-30',  interval: 10000 },
  { id: 2, name: 'SAE 5W-40',  interval: 7000  },
  { id: 3, name: 'SAE 10W-40', interval: 8000  }
]);
let smsConfig = DB.get('sms', {
  api_url: '',
  oil_message:        '{car_name} ({car_number}) — dvigatel moyi almashtirish vaqti keldi! Probeg: {km} km. Sana: {date}',
  antifreeze_message: '{car_name} ({car_number}) — antifriz almashtirish vaqti keldi! Probeg: {km} km. Sana: {date}',
  gearbox_message:    '{car_name} ({car_number}) — karobka moyi almashtirish vaqti keldi! Probeg: {km} km. Sana: {date}',
  enabled: false,
  sms_sent_count: 0
});
let smsLog    = DB.get('sms_log', []);   // [{id, car_name, car_number, type, km, date, time, status}]
let cfg       = DB.get('cfg', { warn_pct: 80, danger_pct: 100, theme: 'dark', balance_url: '' });
let WPCT      = cfg.warn_pct   / 100;
let DPCT      = cfg.danger_pct / 100;
let curCar    = null;

// Antifriz status tanlash holati (pill tugma uchun)
let afStatus  = 'green';   // default
let gbStatus  = 'green';   // default

// ========== SAVE HELPERS ==========
const saveCars   = () => DB.set('cars',    allCars);
const saveOils   = () => DB.set('oils',    allOils);
const saveSms    = () => DB.set('sms',     smsConfig);
const saveCfg    = () => DB.set('cfg',     cfg);
const saveSmsLog = () => DB.set('sms_log', smsLog);

// ========== THEME ==========
function applyTheme() {
  const light = cfg.theme === 'light';
  document.body.classList.toggle('light', light);
  document.getElementById('theme-btn').textContent  = light ? '🌙' : '☀️';
  const tog = document.getElementById('dark-mode-toggle');
  if (tog) tog.checked = light;
  const lbl = document.getElementById('theme-label');
  if (lbl) lbl.textContent = light ? '☀️ Kunduzgi rejim' : '🌙 Tungi rejim';
}
function toggleTheme(light) { cfg.theme = light ? 'light' : 'dark'; saveCfg(); applyTheme(); }
document.getElementById('theme-btn').addEventListener('click', () => {
  cfg.theme = cfg.theme === 'dark' ? 'light' : 'dark'; saveCfg(); applyTheme();
});

// ========== STATUS HELPERS ==========
function oilInt(name) {
  const o = allOils.find(o => o.name === name);
  return o ? o.interval : 10000;
}
function carSt(car) {
  const oU = (car.total_km - car.oil_change_km)  / oilInt(car.oil_name);
  const aU = (car.total_km - car.antifreeze_km)  / (car.antifreeze_interval || 30000);
  const gU = (car.total_km - car.gearbox_km)     / (car.gearbox_interval   || 50000);
  const m  = Math.max(oU, aU, gU);
  if (m >= DPCT) return { cls: 'su', dot: 'ug' };
  if (m >= WPCT) return { cls: 'sw', dot: 'wn' };
  return { cls: '', dot: 'ok' };
}
function svcE(u) { return u >= DPCT ? '🔴' : u >= WPCT ? '🟡' : '🟢'; }
function badgeOf(u) {
  if (u >= DPCT) return { t: '🔴 HOZIR!',    c: 'bdn', b: 'd' };
  if (u >= WPCT) return { t: '🟡 Tez!',       c: 'bwn', b: 'w' };
  return           { t: '🟢 Yaxshi',           c: 'bok', b: '' };
}

// ========== NAVIGATION ==========
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

// ========== DASHBOARD ==========
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

  const uel   = document.getElementById('urgent-list');
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
  const s  = carSt(car);
  const oi = oilInt(car.oil_name);
  const oU = (car.total_km - car.oil_change_km) / oi;
  const aU = (car.total_km - car.antifreeze_km) / (car.antifreeze_interval || 30000);
  const gU = (car.total_km - car.gearbox_km)    / (car.gearbox_interval   || 50000);
  return `<div class="ci ${s.cls}" data-id="${car.id}">
    <div class="cav">🚗</div>
    <div class="cinfo">
      <div class="cname">${car.car_name}</div>
      <div class="cmeta">${car.car_number} · ${car.total_km.toLocaleString()} km</div>
      <div class="cbadges">${svcE(oU)} ${svcE(aU)} ${svcE(gU)}</div>
    </div>
  </div>`;
}
function addCIE(el) {
  el.querySelectorAll('.ci').forEach(e => {
    e.addEventListener('click', () => { curCar = allCars.find(c => c.id == e.dataset.id); openModal(); });
  });
}

// ========== CARS GRID ==========
function loadCarsGrid(q = '') {
  const grid = document.getElementById('cars-grid');
  const f = q
    ? allCars.filter(c => c.car_number.toLowerCase().includes(q) || c.car_name.toLowerCase().includes(q))
    : allCars;
  if (!f.length) {
    grid.innerHTML = `<div class="empty" style="grid-column:1/-1">
      <div class="ei">${allCars.length ? '🔍' : '🚗'}</div>
      <p>${allCars.length ? 'Mashina topilmadi' : 'Mashinalar yo\'q'}</p></div>`;
    return;
  }
  grid.innerHTML = f.map(car => {
    const s  = carSt(car);
    const oi = oilInt(car.oil_name);
    const oU = (car.total_km - car.oil_change_km) / oi;
    const aU = (car.total_km - car.antifreeze_km) / (car.antifreeze_interval || 30000);
    const gU = (car.total_km - car.gearbox_km)    / (car.gearbox_interval   || 50000);
    return `<div class="cc" data-id="${car.id}">
      <div class="cc-top">🚗<div class="cdot ${s.dot}"></div></div>
      <div class="cc-body">
        <div class="cn">${car.car_name}</div>
        <div class="cnum">${car.car_number}</div>
        <div class="ckm">🏁 ${car.total_km.toLocaleString()} km</div>
        <div class="cst">${svcE(oU)} ${svcE(aU)} ${svcE(gU)}</div>
      </div>
    </div>`;
  }).join('');
  grid.querySelectorAll('.cc').forEach(e => {
    e.addEventListener('click', () => { curCar = allCars.find(c => c.id == e.dataset.id); openModal(); });
  });
}
function filterGrid() { loadCarsGrid(document.getElementById('car-search').value.toLowerCase().trim()); }

// ========== OIL SELECT ==========
function renderOilSel(id, val) {
  const sel = document.getElementById(id);
  if (!sel) return;
  const cur = val || sel.value;
  sel.innerHTML = '<option value="">Tanlang...</option>' +
    allOils.map(o => `<option value="${o.name}"${o.name === cur ? ' selected' : ''}>${o.name} (${o.interval.toLocaleString()} km)</option>`).join('');
}

// ========== PILL BUTTONS — ADD CAR ==========
// Antifriz pill bosish
document.querySelectorAll('[data-af]').forEach(btn => {
  btn.addEventListener('click', () => {
    afStatus = btn.dataset.af;
    document.querySelectorAll('[data-af]').forEach(b => b.classList.toggle('pill-active', b.dataset.af === afStatus));
    const hints = { green: '🟢 Yaxshi holat saqlandi', yellow: '🟡 Tez orada almashtirish kerak', red: '🔴 Hoziroq almashtirish kerak!' };
    const cls   = { green: 'green', yellow: 'yellow', red: 'red' };
    document.getElementById('antifreeze-status-hint').innerHTML =
      `<span class="status-chip ${cls[afStatus]}">${hints[afStatus]}</span>`;
  });
});

// Karobka pill bosish
document.querySelectorAll('[data-gb]').forEach(btn => {
  btn.addEventListener('click', () => {
    gbStatus = btn.dataset.gb;
    document.querySelectorAll('[data-gb]').forEach(b => b.classList.toggle('pill-active', b.dataset.gb === gbStatus));
    const hints = { green: '🟢 Yaxshi holat saqlandi', yellow: '🟡 Tez orada almashtirish kerak', red: '🔴 Hoziroq almashtirish kerak!' };
    const cls   = { green: 'green', yellow: 'yellow', red: 'red' };
    document.getElementById('gearbox-status-hint').innerHTML =
      `<span class="status-chip ${cls[gbStatus]}">${hints[gbStatus]}</span>`;
  });
});

// Moy tanlanganda oil-hint ko'rsatadi (tur tanlandi xabari)
document.getElementById('oil-name')?.addEventListener('change', () => {
  const sel = document.getElementById('oil-name').value;
  const hint = document.getElementById('oil-hint');
  if (!hint) return;
  if (sel) {
    const interval = oilInt(sel);
    hint.innerHTML = `<span class="status-chip green">✅ Tanlandi · ${interval.toLocaleString()} km har almashtiriladi</span>`;
  } else {
    hint.innerHTML = '';
  }
});

// ========== PILL STATUS → KM HISOBLASH ==========
// statusdan antifreeze_km hisoblaydi (hozirgi km va interval asosida)
function pillToKm(status, totalKm, interval) {
  if (status === 'green')  return Math.max(0, Math.round(totalKm - interval * 0.2));
  if (status === 'yellow') return Math.max(0, Math.round(totalKm - interval * 0.8));
  return Math.max(0, Math.round(totalKm - interval * 1.05));   // red
}

// ========== ADD CAR FORM ==========
function resetAddCarForm() {
  document.getElementById('add-car-form').reset();
  renderOilSel('oil-name');
  ['oil-hint', 'antifreeze-status-hint', 'gearbox-status-hint'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  afStatus = 'green'; gbStatus = 'green';
  document.querySelectorAll('[data-af]').forEach(b => b.classList.remove('pill-active'));
  document.querySelectorAll('[data-gb]').forEach(b => b.classList.remove('pill-active'));
}

document.getElementById('add-car-form').addEventListener('submit', e => {
  e.preventDefault();
  const km     = parseInt(document.getElementById('current-km').value)   || 0;
  const name   = document.getElementById('car-name').value.trim();
  const number = document.getElementById('car-number').value.trim();
  const oil    = document.getElementById('oil-name').value;

  if (!name || !number || !oil) { showToast('❌ Barcha maydonlarni to\'ldiring', 'error'); return; }

  const gearInterval = parseInt(document.getElementById('gearbox-interval').value) || 50000;
  const afInterval   = 30000;   // Antifriz uchun standart interval (ko'rsatilmaydi, ichki)

  // Pill statusidan km hisoblash
  const antiKm  = pillToKm(afStatus, km, afInterval);
  const gearKm  = pillToKm(gbStatus, km, gearInterval);

  const car = {
    id:                  DB.nextId('car'),
    car_name:            name,
    car_number:          number,
    daily_km:            parseInt(document.getElementById('daily-km').value) || 50,
    phone_number:        document.getElementById('phone-number').value.trim(),
    oil_name:            oil,
    total_km:            km,
    oil_change_km:       km,          // Hozirgi probegdan boshlanadi
    antifreeze_km:       antiKm,      // Pill statusiga qarab
    gearbox_km:          gearKm,      // Pill statusiga qarab
    antifreeze_interval: afInterval,
    gearbox_interval:    gearInterval,
    history:             [],
    added_at:            new Date().toISOString()
  };

  allCars.push(car);
  saveCars();
  showToast('✅ Mashina qo\'shildi!', 'success');
  resetAddCarForm();
  navigateTo('cars');
});

// ========== OILS PAGE ==========
function loadOilsPage() {
  const list = document.getElementById('oils-list');
  list.innerHTML = allOils.length
    ? allOils.map(o => `
      <div class="oi">
        <div><div class="on">🛢️ ${o.name}</div><div class="oint">📍 ${o.interval.toLocaleString()} km</div></div>
        <button class="odel" onclick="deleteOil(${o.id})">🗑️</button>
      </div>`).join('')
    : '<div class="empty"><div class="ei">🛢️</div><p>Hech qanday moy yo\'q</p></div>';
}
document.getElementById('add-oil-form').addEventListener('submit', e => {
  e.preventDefault();
  const name     = document.getElementById('oil-name-input').value.trim();
  const interval = parseInt(document.getElementById('oil-interval-input').value);
  if (!name || !interval) { showToast('❌ Barcha maydonlarni to\'ldiring', 'error'); return; }
  allOils.push({ id: DB.nextId('oil'), name, interval });
  saveOils();
  showToast('✅ Moy turi qo\'shildi!', 'success');
  document.getElementById('add-oil-form').reset();
  loadOilsPage();
});
function deleteOil(id) {
  if (!confirm('Moy turini o\'chirasizmi?')) return;
  allOils = allOils.filter(o => o.id !== id);
  saveOils();
  showToast('✅ O\'chirildi!', 'success');
  loadOilsPage();
}

// ========== SMS ANALYTICS HELPERS ==========
function todayStr() {
  return new Date().toISOString().slice(0, 10);   // "2025-04-01"
}

function todayLogs() {
  return smsLog.filter(l => l.date === todayStr());
}

function addSmsLog(car, type, km) {
  const now = new Date();
  smsLog.push({
    id:         Date.now(),
    car_name:   car.car_name,
    car_number: car.car_number,
    type,
    km,
    date:       now.toISOString().slice(0, 10),
    time:       now.toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' }),
    status:     'yuborildi'
  });
  saveSmsLog();
}

function renderSmsLog() {
  const el   = document.getElementById('sms-log-list');
  if (!el) return;
  const logs = [...todayLogs()].reverse();
  if (!logs.length) {
    el.innerHTML = '<div class="log-empty">Bugun hech qanday SMS yuborilmagan</div>';
    return;
  }
  const icons = { oil: '🛢️', antifreeze: '🔵', gearbox: '🟢' };
  const names = { oil: 'Dvigatel Moyi', antifreeze: 'Antifriz', gearbox: 'Karobka Moyi' };
  el.innerHTML = logs.map(l => `
    <div class="log-item">
      <div class="log-icon">${icons[l.type] || '📨'}</div>
      <div class="log-info">
        <div class="log-car">${l.car_name} <span class="log-num">${l.car_number}</span></div>
        <div class="log-type">${names[l.type] || l.type} · 🏁 ${l.km.toLocaleString()} km</div>
      </div>
      <div class="log-time">${l.time}</div>
    </div>`).join('');
}

function updateAnalytics() {
  const totalEl   = document.getElementById('an-total');
  const todayEl   = document.getElementById('an-today');
  if (totalEl) totalEl.textContent = (smsConfig.sms_sent_count || 0).toLocaleString();
  if (todayEl)  todayEl.textContent = todayLogs().length;
  renderSmsLog();
}

async function checkBalance() {
  const url = document.getElementById('balance-api-url')?.value?.trim();
  const el  = document.getElementById('an-balance');
  if (!url) { showToast('⚠️ Balans API URL kiriting', 'error'); return; }
  el.textContent = '...';
  try {
    const res  = await fetch(url);
    const data = await res.json().catch(() => null);
    // JSON javobdan balance/sum/amount field topib ko'rish
    const bal = data?.balance ?? data?.sum ?? data?.amount ?? data?.data?.balance ?? '?';
    el.textContent = bal;
    cfg.balance_url = url;
    saveCfg();
    showToast('✅ Balans yangilandi', 'success');
  } catch {
    el.textContent = 'Xato';
    showToast('❌ Balans yuklanmadi. URL to\'g\'riligini tekshiring.', 'error');
  }
}

function clearTodayLog() {
  if (!confirm('Bugungi SMS jurnalini tozalaysizmi?')) return;
  const today = todayStr();
  smsLog = smsLog.filter(l => l.date !== today);
  saveSmsLog();
  showToast('✅ Bugungi jurnal tozalandi', 'success');
  renderSmsLog();
  updateAnalytics();
}

function exportSmsLog() {
  const data = JSON.stringify(smsLog, null, 2);
  const a    = document.createElement('a');
  a.href     = 'data:application/json,' + encodeURIComponent(data);
  a.download = 'sms-jurnal.json';
  a.click();
  showToast('✅ Jurnal eksport qilindi', 'success');
}

// ========== SMS PAGE ==========
function loadSmsPage() {
  document.getElementById('sms-api-url').value             = smsConfig.api_url           || '';
  document.getElementById('sms-oil-message').value         = smsConfig.oil_message        || '';
  document.getElementById('sms-antifreeze-message').value  = smsConfig.antifreeze_message || '';
  document.getElementById('sms-gearbox-message').value     = smsConfig.gearbox_message    || '';
  document.getElementById('sms-enabled').checked           = !!smsConfig.enabled;

  // Balans URL
  const balUrl = document.getElementById('balance-api-url');
  if (balUrl) balUrl.value = cfg.balance_url || '';

  // API status
  const ae = document.getElementById('sms-api-status');
  if (ae) {
    ae.textContent = smsConfig.api_url ? '✅' : '❌';
    ae.style.color = smsConfig.api_url ? 'var(--success)' : 'var(--danger)';
  }

  // Status card
  const card = document.getElementById('sms-status-card');
  const el   = document.getElementById('sms-status');
  if (smsConfig.enabled && smsConfig.api_url) {
    el.textContent = '✅ SMS faol'; card.classList.add('on');
  } else if (!smsConfig.api_url) {
    el.textContent = '⚠️ API URL kiritilmagan'; card.classList.remove('on');
  } else {
    el.textContent = '❌ SMS o\'chirilgan'; card.classList.remove('on');
  }

  updateAnalytics();
}

document.getElementById('sms-config-form').addEventListener('submit', e => {
  e.preventDefault();
  smsConfig.api_url            = document.getElementById('sms-api-url').value;
  smsConfig.oil_message        = document.getElementById('sms-oil-message').value;
  smsConfig.antifreeze_message = document.getElementById('sms-antifreeze-message').value;
  smsConfig.gearbox_message    = document.getElementById('sms-gearbox-message').value;
  smsConfig.enabled            = document.getElementById('sms-enabled').checked;
  saveSms();
  showToast('✅ SMS sozlamalari saqlandi!', 'success');
  loadSmsPage();
});

function resetSmsCount() {
  if (!confirm('SMS hisoblagichni nolga tiklaysizmi?')) return;
  smsConfig.sms_sent_count = 0;
  saveSms();
  showToast('✅ Hisoblagich tiklandi', 'success');
  updateAnalytics();
}

// ========== SMS TEMPLATE ==========
function processSmsTemplate(template, car, serviceType) {
  const oi   = oilInt(car.oil_name);
  const now  = new Date();
  const date = now.toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' });

  let lastKm = car.oil_change_km, interval = oi;
  if (serviceType === 'antifreeze') { lastKm = car.antifreeze_km; interval = car.antifreeze_interval || 30000; }
  if (serviceType === 'gearbox')    { lastKm = car.gearbox_km;    interval = car.gearbox_interval   || 50000; }
  const remain = Math.max(0, interval - (car.total_km - lastKm));

  return (template || '')
    .replace(/{car_name}/g,   car.car_name)
    .replace(/{car_number}/g, car.car_number)
    .replace(/{km}/g,         car.total_km.toLocaleString())
    .replace(/{date}/g,       date)
    .replace(/{remain_km}/g,  remain.toLocaleString());
}

// ========== CAR MODAL ==========
function openModal() {
  if (!curCar) return;
  const oi = oilInt(curCar.oil_name);
  const oU = (curCar.total_km - curCar.oil_change_km) / oi;
  const aU = (curCar.total_km - curCar.antifreeze_km) / (curCar.antifreeze_interval || 30000);
  const gU = (curCar.total_km - curCar.gearbox_km)    / (curCar.gearbox_interval   || 50000);

  document.getElementById('modal-car-info').innerHTML = `
    <h3>${curCar.car_name}</h3>
    <p>${curCar.car_number}</p>
    <p style="margin-top:4px;font-size:12px;opacity:.85">🏁 Probeg: <strong>${curCar.total_km.toLocaleString()} km</strong></p>`;

  const svcBlock = (u, label, used, interval) => {
    const b = badgeOf(u);
    return `<div class="svi">
      <h4>${label}</h4>
      <span class="badge ${b.c}">${b.t}</span>
      <div class="pb"><div class="pf ${b.b}" style="width:${Math.min(u * 100, 100).toFixed(1)}%"></div></div>
      <div class="skm">${used.toLocaleString()} / ${interval.toLocaleString()} km</div>
    </div>`;
  };

  document.getElementById('modal-services').innerHTML =
    svcBlock(oU, `🛢️ Dvigatel Moyi — <em style="font-weight:400;font-size:11px">${curCar.oil_name}</em>`,
      curCar.total_km - curCar.oil_change_km, oi) +
    svcBlock(aU, '🔵 Antifriz', curCar.total_km - curCar.antifreeze_km, curCar.antifreeze_interval || 30000) +
    svcBlock(gU, '🟢 Karobka Moyi', curCar.total_km - curCar.gearbox_km, curCar.gearbox_interval || 50000);

  document.getElementById('modal-km').value = curCar.total_km;
  renderOilSel('modal-oil-select', curCar.oil_name);
  loadHistory();

  const hint = document.getElementById('sms-hint');
  if (smsConfig.enabled && smsConfig.api_url) {
    hint.innerHTML   = '💬 SMS yoqilgan — mashina rusumi va nomeri avtomatik qo\'shiladi';
    hint.style.display = 'block';
  } else {
    hint.style.display = 'none';
  }

  switchTab('info');
  document.getElementById('car-modal').classList.add('active');
}

function loadHistory() {
  const hist = curCar.history || [];
  const el   = document.getElementById('modal-history');
  if (!hist.length) {
    el.innerHTML = '<div class="empty"><div class="ei">📭</div><p>Tarix mavjud emas</p></div>';
    return;
  }
  const today  = new Date().toDateString();
  const icons  = { oil: '🛢️', antifreeze: '🔵', gearbox: '🟢' };
  const labels = { oil: 'Dvigatel Moyi', antifreeze: 'Antifriz', gearbox: 'Karobka Moyi' };
  el.innerHTML = [...hist].reverse().map(log => {
    const d   = new Date(log.date);
    const isT = d.toDateString() === today;
    const ds  = isT
      ? '<span class="htlbl">Bugun almashtirildi ✅</span>'
      : d.toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
    return `<div class="hi${isT ? ' ht' : ''}">
      <div class="hico">${icons[log.type] || '🔧'}</div>
      <div>
        <div class="htype">${icons[log.type] || ''} ${labels[log.type] || log.type}${log.oil_name ? ' — ' + log.oil_name : ''}</div>
        <div class="hkm">🏁 ${log.km.toLocaleString()} km</div>
        <div class="hdate">${ds}</div>
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

// ========== CAR ACTIONS ==========
document.getElementById('btn-update-km').addEventListener('click', () => {
  const km = parseInt(document.getElementById('modal-km').value);
  if (!km || km < 0) { showToast('❌ KM to\'g\'ri kiriting', 'error'); return; }
  curCar.total_km = km;
  allCars = allCars.map(c => c.id === curCar.id ? curCar : c);
  saveCars();
  showToast('✅ Probeg yangilandi!', 'success');
  openModal(); loadDashboard();
});

document.getElementById('btn-change-svc').addEventListener('click', () => {
  const type    = document.getElementById('modal-svc-type').value;
  const oilName = document.getElementById('modal-oil-select').value || curCar.oil_name;
  const km      = parseInt(document.getElementById('modal-km').value) || curCar.total_km;

  curCar.total_km = km;
  if      (type === 'oil')        { curCar.oil_change_km = km; curCar.oil_name = oilName; }
  else if (type === 'antifreeze')   curCar.antifreeze_km  = km;
  else if (type === 'gearbox')      curCar.gearbox_km     = km;

  if (!curCar.history) curCar.history = [];
  curCar.history.push({ type, km, oil_name: type === 'oil' ? oilName : null, date: new Date().toISOString() });

  allCars = allCars.map(c => c.id === curCar.id ? curCar : c);
  saveCars();

  // SMS yuborish
  if (smsConfig.enabled && smsConfig.api_url) {
    const tplMap = { oil: 'oil_message', antifreeze: 'antifreeze_message', gearbox: 'gearbox_message' };
    const msg    = processSmsTemplate(smsConfig[tplMap[type]] || '', curCar, type);

    // Real HTTP so'rov
    const url = new URL(smsConfig.api_url);
    url.searchParams.set('phone',   curCar.phone_number);
    url.searchParams.set('message', msg);
    fetch(url.toString()).catch(() => {});

    // Log va hisoblagich
    smsConfig.sms_sent_count = (smsConfig.sms_sent_count || 0) + 1;
    saveSms();
    addSmsLog(curCar, type, km);
  }

  const labels = { oil: 'Dvigatel moyi almashtirildi', antifreeze: 'Antifriz yangilandi', gearbox: 'Karobka moyi almashtirildi' };
  showToast('✅ ' + (labels[type] || 'Xizmat bajarildi') + '!', 'success');
  openModal(); loadDashboard();
});

document.getElementById('btn-delete-car').addEventListener('click', () => {
  if (!confirm('Mashinani o\'chirasizmi?')) return;
  allCars = allCars.filter(c => c.id !== curCar.id);
  saveCars();
  document.getElementById('car-modal').classList.remove('active');
  showToast('✅ Mashina o\'chirildi!', 'success');
  loadDashboard(); loadCarsGrid();
});

// ========== SETTINGS ==========
document.getElementById('btn-settings').addEventListener('click', () => document.getElementById('settings-panel').classList.add('open'));
document.getElementById('close-settings').addEventListener('click', closeSettings);
document.getElementById('settings-overlay').addEventListener('click', closeSettings);
function closeSettings() { document.getElementById('settings-panel').classList.remove('open'); }

function saveThresholds() {
  const w = parseFloat(document.getElementById('setting-warn').value);
  const d = parseFloat(document.getElementById('setting-danger').value);
  WPCT = w / 100; DPCT = d / 100;
  cfg.warn_pct = w; cfg.danger_pct = d;
  saveCfg();
  showToast('✅ Sozlamalar saqlandi', 'success');
  loadDashboard();
}

function exportData() {
  const data = JSON.stringify({ cars: allCars, oils: allOils, sms: smsConfig, cfg }, null, 2);
  const a    = document.createElement('a');
  a.href     = 'data:application/json,' + encodeURIComponent(data);
  a.download = 'moytrack-backup.json';
  a.click();
  showToast('✅ Ma\'lumotlar eksport qilindi', 'success');
}

function confirmClear() {
  if (confirm('Barcha ma\'lumotlarni o\'chirasizmi? Bu amalni qaytarib bo\'lmaydi!')) {
    ['cars', 'oils', '_id_car', '_id_oil', 'sms_log'].forEach(k => localStorage.removeItem('mt_' + k));
    allCars = []; allOils = []; smsLog = [];
    saveCars(); saveOils();
    showToast('✅ Tozalandi', 'success');
    loadDashboard(); closeSettings();
  }
}

// ========== TOAST ==========
function showToast(msg, type = 'success') {
  const t    = document.getElementById('toast');
  t.textContent = msg;
  t.className   = 'toast show ' + type;
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ========== INIT ==========
function init() {
  applyTheme();
  document.getElementById('setting-warn').value   = cfg.warn_pct;
  document.getElementById('setting-danger').value = cfg.danger_pct;
  if (!DB.get('oils_saved', false)) { saveOils(); DB.set('oils_saved', true); }
  loadDashboard();
  renderOilSel('oil-name');
}
init();
