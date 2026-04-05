// ================================================================
// MOYTRACK BACKEND  —  server.js
// Express + Firebase REST + devsms.uz
// ================================================================

require('dotenv').config();
const express  = require('express');
const cors     = require('cors');

const app  = express();
app.use(cors());
app.use(express.json());

// ── CONFIG ──────────────────────────────────────────────────────
const FIREBASE_URL = process.env.FIREBASE_URL || 'https://gilamuz-8308f-default-rtdb.firebaseio.com';
const PORT         = process.env.PORT || 3001;

// ── DEFAULT SHABLONLAR ──────────────────────────────────────────
const DEFAULT_SMS = {
  save_message:           '{car_name} ({car_number}) saqlandi!\n📅 {date} {time}\n🔧 Almashtirildi: {services}\n🏁 Probeg: {km} km',
  oil_message:            '{car_name} ({car_number}) — dvigatel moyi: {oil_brand}\n📅 {date} {time} · 🏁 {km} km',
  gearbox_message:        '{car_name} ({car_number}) — karobka moyi yangilandi\n📅 {date} {time} · 🏁 {km} km',
  antifreeze_message:     '{car_name} ({car_number}) — antifriz yangilandi\n📅 {date} {time} · 🏁 {km} km',
  air_filter_message:     '{car_name} ({car_number}) — havo filtr almashtirildi\n📅 {date} {time} · 🏁 {km} km',
  cabin_filter_message:   '{car_name} ({car_number}) — salon filtr almashtirildi\n📅 {date} {time} · 🏁 {km} km',
  oil_filter_message:     '{car_name} ({car_number}) — moy filtr almashtirildi\n📅 {date} {time} · 🏁 {km} km',
  default_change_message: '{car_name} ({car_number}) — {service_label} almashtirildi\n📅 {date} {time} · 🏁 {km} km',
};

const SVC_META = {
  oil:          { icon: '🛢️', label: 'Dvigatel Moyi' },
  antifreeze:   { icon: '🔵', label: 'Antifriz'       },
  gearbox:      { icon: '🟢', label: 'Karobka Moyi'   },
  air_filter:   { icon: '💨', label: 'Havo Filtr'     },
  cabin_filter: { icon: '🌬️', label: 'Salon Filtr'    },
  oil_filter:   { icon: '🔩', label: 'Moy Filtr'      },
};

// ── YORDAMCHI FUNKSIYALAR ───────────────────────────────────────

/** Hozirgi sana — uz-UZ formatda */
function nowDate() {
  return new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** Hozirgi vaqt */
function nowTime() {
  return new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Shablon ichidagi {o'zgaruvchi}larni haqiqiy qiymatlar bilan almashtiradi.
 * @param {string} tmpl  - shablon matni
 * @param {object} car   - mashina obyekti
 * @param {string} svcType - xizmat turi (oil, gearbox, ...)
 * @param {string} svcList - saqlash SMS uchun xizmatlar ro'yxati
 */
function fillTemplate(tmpl, car, svcType = '', svcList = '') {
  if (!tmpl) return '';
  const svcLabel = SVC_META[svcType]?.label || svcType;
  return tmpl
    .replace(/{car_name}/g,     car.car_name   || '')
    .replace(/{car_number}/g,   car.car_number  || '')
    .replace(/{km}/g,           (car.total_km || 0).toLocaleString('uz-UZ'))
    .replace(/{date}/g,          nowDate())
    .replace(/{time}/g,          nowTime())
    .replace(/{oil_brand}/g,     car.oil_name    || '—')
    .replace(/{services}/g,      svcList         || 'Ko\'rsatilmagan')
    .replace(/{service_label}/g, svcLabel);
}

// ── FIREBASE REST ───────────────────────────────────────────────
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function fbGet(path) {
  try {
    const r = await fetch(`${FIREBASE_URL}/${path}.json`);
    if (!r.ok) return { ok: false, status: r.status, data: null };
    const data = await r.json();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function fbPut(path, body) {
  try {
    const r = await fetch(`${FIREBASE_URL}/${path}.json`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── DEVSMS.UZ YUBORISH ──────────────────────────────────────────
/**
 * devsms.uz orqali SMS yuboradi.
 * @param {string} token   - API token
 * @param {string} phone   - telefon raqami
 * @param {string} message - matn
 * @returns {{ ok, data, error }}
 */
async function sendSms(token, phone, message) {
  if (!token)   return { ok: false, error: 'Token yo\'q' };
  if (!phone)   return { ok: false, error: 'Telefon raqam yo\'q' };
  if (!message) return { ok: false, error: 'Matn bo\'sh' };

  const cleanPhone = phone.replace(/\D/g, '');
  try {
    const r = await fetch('https://devsms.uz/api/send_sms.php', {
      method:  'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({ phone: cleanPhone, message }),
    });
    const data = await r.json().catch(() => ({}));
    console.log(`📤 SMS → ${cleanPhone}: ${r.status}`, data);
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    console.error('SMS xatosi:', e.message);
    return { ok: false, error: e.message };
  }
}

// ================================================================
// ROUTES
// ================================================================

// ── 1. SOGLIQ TEKSHIRUVI ────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'MoyTrack Backend', firebase: FIREBASE_URL });
});

// ── 2. SHABLONLARNI OLISH ───────────────────────────────────────
// GET /api/sms-config
// Firebase dan sms_config ni qaytaradi (DEFAULT bilan birlashtirilib)
app.get('/api/sms-config', async (req, res) => {
  const r = await fbGet('sms_config');
  if (!r.ok) return res.status(502).json({ error: 'Firebase xatosi', detail: r.error });

  const config = { ...DEFAULT_SMS, ...(r.data || {}) };
  res.json({ ok: true, config });
});

// ── 3. SHABLONLARNI SAQLASH ─────────────────────────────────────
// POST /api/sms-config
// Body: { devsms_token, enabled, shablonlar... }
// Frontenddan "Shablonlarni saqlash" tugmasi bosilganda chaqiriladi
app.post('/api/sms-config', async (req, res) => {
  const body = req.body || {};

  // Faqat ruxsat etilgan maydonlarni olamiz
  const data = {
    devsms_token:            body.devsms_token            ?? '',
    enabled:                 body.enabled                 ?? false,
    firebase_enabled:        true,
    sms_sent_count:          body.sms_sent_count          ?? 0,
    save_message:            body.save_message            || DEFAULT_SMS.save_message,
    oil_message:             body.oil_message             || DEFAULT_SMS.oil_message,
    gearbox_message:         body.gearbox_message         || DEFAULT_SMS.gearbox_message,
    antifreeze_message:      body.antifreeze_message      || DEFAULT_SMS.antifreeze_message,
    air_filter_message:      body.air_filter_message      || DEFAULT_SMS.air_filter_message,
    cabin_filter_message:    body.cabin_filter_message    || DEFAULT_SMS.cabin_filter_message,
    oil_filter_message:      body.oil_filter_message      || DEFAULT_SMS.oil_filter_message,
    default_change_message:  body.default_change_message  || DEFAULT_SMS.default_change_message,
    test_phone:               body.test_phone               || '',
  };

  const r = await fbPut('sms_config', data);
  if (!r.ok) return res.status(502).json({ error: 'Firebase saqlashda xato', detail: r.error });

  console.log('✅ sms_config Firebase ga saqlandi');
  res.json({ ok: true, message: 'Shablonlar saqlandi va Firebase ga yuborildi', data });
});

// ── 4. SHABLON TEST SMS ─────────────────────────────────────────
// POST /api/sms/test
// Body: { token, phone, template_key, template_override?, car? }
// template_override: frontenddan textarea dagi joriy matn (ixtiyoriy)
// Bitta shablonni test qilish uchun — Firebase dagi yoki override matn bilan
app.post('/api/sms/test', async (req, res) => {
  const { token, phone, template_key, template_override, car } = req.body || {};

  if (!token)        return res.status(400).json({ ok: false, error: 'token majburiy' });
  if (!phone)        return res.status(400).json({ ok: false, error: 'phone majburiy' });
  if (!template_key) return res.status(400).json({ ok: false, error: 'template_key majburiy' });

  // Firebase dan joriy shablonni olamiz
  const cfgRes = await fbGet('sms_config');
  const config = { ...DEFAULT_SMS, ...(cfgRes.data || {}) };

  // template_override berilgan bo'lsa — Firebase dagi o'rniga shu ishlatiladi
  // Shu bilan "saqlashdan oldin test" ham mumkin
  const tmpl = template_override?.trim() || config[template_key] || DEFAULT_SMS[template_key] || DEFAULT_SMS.default_change_message;

  // Test uchun sintetik mashina (frontenddan real mashina ham kelishi mumkin)
  const testCar = {
    car_name:   car?.car_name   || 'Nexia 3',
    car_number: car?.car_number || '01A 123BC',
    total_km:   car?.total_km   || 85000,
    oil_name:   car?.oil_name   || 'SAE 5W-30',
  };

  const svcType  = template_key.replace('_message', '');
  const svcLabel = SVC_META[svcType]?.label || svcType;
  const text     = fillTemplate(tmpl, testCar, svcType, svcLabel);

  console.log(`📤 Test SMS [${template_key}] → ${phone}`);
  console.log('   Matn:', text);

  const smsRes = await sendSms(token, phone, text);

  res.json({
    ok:              smsRes.ok,
    sent_to:         phone,
    text,
    template_used:   tmpl,
    template_source: template_override ? 'override (textarea)' : 'firebase',
    devsms:          smsRes.data,
    error:           smsRes.error,
  });
});

// ── 5. XIZMAT ALMASHTIRISH SMS ──────────────────────────────────
// POST /api/sms/service-change
// Body: { car, service_type, token? }
// Xizmat almashtirish tugmasi bosilganda chaqiriladi
app.post('/api/sms/service-change', async (req, res) => {
  const { car, service_type, token } = req.body || {};

  if (!car)          return res.status(400).json({ error: 'car majburiy' });
  if (!service_type) return res.status(400).json({ error: 'service_type majburiy' });

  // Token: so'rovda kelgan yoki Firebase dan olinadi
  let smsToken = token;
  const cfgRes = await fbGet('sms_config');
  const config = { ...DEFAULT_SMS, ...(cfgRes.data || {}) };

  if (!smsToken) smsToken = config.devsms_token;
  if (!smsToken) return res.status(400).json({ error: 'devsms_token yo\'q — Firebase yoki so\'rovda bering' });
  if (!config.enabled) return res.status(400).json({ error: 'SMS o\'chirilgan' });

  const svcLabel  = SVC_META[service_type]?.label || service_type;
  const tplKey    = service_type + '_message';
  const tmpl      = config[tplKey] || DEFAULT_SMS[tplKey] || DEFAULT_SMS.default_change_message;
  const text      = fillTemplate(tmpl, car, service_type, svcLabel);
  const phone     = car.phone_number;

  if (!phone) return res.status(400).json({ error: 'car.phone_number yo\'q' });

  const smsRes = await sendSms(smsToken, phone, text);

  // SMS count yangilash
  if (smsRes.ok) {
    const newCount = (config.sms_sent_count || 0) + 1;
    await fbPut('sms_config', { ...config, sms_sent_count: newCount, devsms_token: smsToken });
  }

  res.json({
    ok:           smsRes.ok,
    sent_to:      phone,
    service_type,
    text,
    devsms:       smsRes.data,
    error:        smsRes.error,
  });
});

// ── 6. MASHINA SAQLASH SMS ──────────────────────────────────────
// POST /api/sms/car-saved
// Body: { car, checked_keys, token? }
// Mashina qo'shilganda yuboriladi
app.post('/api/sms/car-saved', async (req, res) => {
  const { car, checked_keys = [], token } = req.body || {};

  if (!car) return res.status(400).json({ error: 'car majburiy' });

  const cfgRes = await fbGet('sms_config');
  const config = { ...DEFAULT_SMS, ...(cfgRes.data || {}) };

  let smsToken = token || config.devsms_token;
  if (!smsToken) return res.status(400).json({ error: 'devsms_token yo\'q' });
  if (!config.enabled) return res.status(400).json({ error: 'SMS o\'chirilgan' });
  if (!car.phone_number) return res.status(400).json({ error: 'car.phone_number yo\'q' });

  // Almashtirilgan xizmatlar ro'yxati
  const svcList = checked_keys
    .map(k => { const m = SVC_META[k]; return m ? `${m.icon} ${m.label}` : k; })
    .join(', ');

  const tmpl = config.save_message || DEFAULT_SMS.save_message;
  const text = fillTemplate(tmpl, car, '', svcList);

  const smsRes = await sendSms(smsToken, car.phone_number, text);

  if (smsRes.ok) {
    const newCount = (config.sms_sent_count || 0) + 1;
    await fbPut('sms_config', { ...config, sms_sent_count: newCount, devsms_token: smsToken });
  }

  res.json({
    ok:      smsRes.ok,
    sent_to: car.phone_number,
    text,
    devsms:  smsRes.data,
    error:   smsRes.error,
  });
});

// ── 7. AVTOMATIK TEKSHIRUV SMS ──────────────────────────────────
// POST /api/sms/auto-check
// Body: { cars, oils }
// Cron yoki frontend trigger bilan chaqiriladi
app.post('/api/sms/auto-check', async (req, res) => {
  const { cars = [], oils = [] } = req.body || {};

  const cfgRes = await fbGet('sms_config');
  const config = { ...DEFAULT_SMS, ...(cfgRes.data || {}) };

  if (!config.enabled || !config.devsms_token) {
    return res.json({ ok: false, message: 'SMS yoqilmagan yoki token yo\'q', sent: [] });
  }

  function oilInterval(name) {
    const o = oils.find(o => o.name === name);
    return o ? o.interval : 10000;
  }

  const DPCT = 1.0; // 100%
  const sent = [];

  for (const car of cars) {
    if (!car.phone_number) continue;

    const checks = [
      { key: 'oil',          u: (car.total_km - car.oil_change_km)  / oilInterval(car.oil_name) },
      { key: 'antifreeze',   u: (car.total_km - car.antifreeze_km)  / (car.antifreeze_interval  || 30000) },
      { key: 'gearbox',      u: (car.total_km - car.gearbox_km)     / (car.gearbox_interval     || 50000) },
      { key: 'air_filter',   u: (car.total_km - (car.air_filter_km   || car.total_km)) / (car.air_filter_interval   || 15000) },
      { key: 'cabin_filter', u: (car.total_km - (car.cabin_filter_km || car.total_km)) / (car.cabin_filter_interval || 15000) },
      { key: 'oil_filter',   u: (car.total_km - (car.oil_filter_km  || car.total_km)) / (car.oil_filter_interval   || 10000) },
    ];

    for (const svc of checks) {
      if (svc.u >= DPCT) {
        const svcLabel = SVC_META[svc.key]?.label || svc.key;
        const tplKey   = svc.key + '_message';
        const tmpl     = config[tplKey] || DEFAULT_SMS[tplKey] || DEFAULT_SMS.default_change_message;
        const text     = fillTemplate(tmpl, car, svc.key, svcLabel);
        const smsRes   = await sendSms(config.devsms_token, car.phone_number, text);

        sent.push({
          car_name:     car.car_name,
          car_number:   car.car_number,
          service:      svc.key,
          ok:           smsRes.ok,
          text,
          error:        smsRes.error,
        });
      }
    }
  }

  // SMS count yangilash
  const okCount = sent.filter(s => s.ok).length;
  if (okCount > 0) {
    const newCount = (config.sms_sent_count || 0) + okCount;
    await fbPut('sms_config', { ...config, sms_sent_count: newCount });
  }

  res.json({ ok: true, checked: cars.length, sent });
});

// ── 8. TO'G'RIDAN SMS YUBORISH ─────────────────────────────────
// POST /api/sms/send
// Body: { token, phone, message }
// Frontend sendSms() fallback orqali chaqiriladi
app.post('/api/sms/send', async (req, res) => {
  const { token, phone, message } = req.body || {};

  if (!token)   return res.status(400).json({ ok: false, error: 'token majburiy' });
  if (!phone)   return res.status(400).json({ ok: false, error: 'phone majburiy' });
  if (!message) return res.status(400).json({ ok: false, error: 'message majburiy' });

  const smsRes = await sendSms(token, phone, message);

  // SMS count Firebase da yangilash
  if (smsRes.ok) {
    const cfgRes = await fbGet('sms_config');
    if (cfgRes.ok && cfgRes.data) {
      const newCount = (cfgRes.data.sms_sent_count || 0) + 1;
      await fbPut('sms_config', { ...cfgRes.data, sms_sent_count: newCount });
    }
  }

  res.json({
    ok:      smsRes.ok,
    sent_to: phone,
    devsms:  smsRes.data,
    error:   smsRes.error,
  });
});

// ── 9. FIREBASE PING ────────────────────────────────────────────
app.get('/api/firebase/ping', async (req, res) => {
  const r = await fbGet('_ping');
  res.json({ ok: r.status !== 0, firebase_url: FIREBASE_URL, status: r.status });
});

// ================================================================
// START
// ================================================================
app.listen(PORT, () => {
  console.log(`\n🚀 MoyTrack Backend ishga tushdi!`);
  console.log(`   Port    : http://localhost:${PORT}`);
  console.log(`   Firebase: ${FIREBASE_URL}`);
  console.log(`\n📌 Endpoint'lar:`);
  console.log(`   GET  /health                   — server holati`);
  console.log(`   GET  /api/sms-config           — shablonlarni olish`);
  console.log(`   POST /api/sms-config           — shablonlarni saqlash (Firebase)`);
  console.log(`   POST /api/sms/test             — bitta shablonni test qilish`);
  console.log(`   POST /api/sms/service-change   — xizmat almashtirish SMS`);
  console.log(`   POST /api/sms/car-saved        — mashina saqlash SMS`);
  console.log(`   POST /api/sms/auto-check       — avtomatik tekshiruv SMS`);
  console.log(`   POST /api/sms/send             — to'g'ridan SMS yuborish`);
  console.log(`   GET  /api/firebase/ping        — Firebase ulanish tekshiruvi\n`);
});
