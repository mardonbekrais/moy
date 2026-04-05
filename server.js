// ================================================================
// MOYTRACK BACKEND  —  server.js
// Express + Firebase REST + devsms.uz
// Node.js · v4.5 Pro
// ================================================================

require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const FIREBASE_URL = process.env.FIREBASE_URL || 'https://gilamuz-8308f-default-rtdb.firebaseio.com';
const PORT         = process.env.PORT || 3001;

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

function nowDate() {
  return new Date().toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' });
}
function nowTime() {
  return new Date().toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' });
}
function fillTemplate(tmpl, car, svcType, svcList) {
  if (!tmpl) return '';
  const svcLabel = SVC_META[svcType]?.label || svcType || '';
  return tmpl
    .replace(/{car_name}/g,     car.car_name    || '')
    .replace(/{car_number}/g,   car.car_number   || '')
    .replace(/{km}/g,           (car.total_km || 0).toLocaleString('uz-UZ'))
    .replace(/{date}/g,          nowDate())
    .replace(/{time}/g,          nowTime())
    .replace(/{oil_brand}/g,     car.oil_name    || '—')
    .replace(/{services}/g,      svcList         || "Ko'rsatilmagan")
    .replace(/{service_label}/g, svcLabel);
}

const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

async function fbGet(p) {
  try {
    const r = await fetch(`${FIREBASE_URL}/${p}.json`);
    if (!r.ok) return { ok: false, status: r.status, data: null };
    const data = await r.json();
    return { ok: true, data };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function fbPut(p, body) {
  try {
    const r = await fetch(`${FIREBASE_URL}/${p}.json`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } catch (e) { return { ok: false, error: e.message }; }
}
async function fbPatch(p, body) {
  try {
    const r = await fetch(`${FIREBASE_URL}/${p}.json`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => null);
    return { ok: r.ok, status: r.status, data };
  } catch (e) { return { ok: false, error: e.message }; }
}

async function sendSms(token, phone, message) {
  if (!token || !phone || !message) return { ok: false, error: 'Parametr yetishmaydi' };
  const cleanPhone = phone.replace(/\D/g, '');
  try {
    const r = await fetch('https://devsms.uz/api/send_sms.php', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: cleanPhone, message }),
    });
    const data = await r.json().catch(() => ({}));
    const isOk = r.ok || data?.status === 'success' || !!data?.message_id;
    console.log(`📤 SMS → ${cleanPhone}: ${r.status}`, data);
    return { ok: isOk, status: r.status, data };
  } catch (e) {
    console.error('SMS xatosi:', e.message);
    return { ok: false, error: e.message };
  }
}

async function saveSmsLog(entry) {
  try {
    const logId = `sms_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    await fbPut(`sms_logs/${logId}`, { ...entry, timestamp: new Date().toISOString(), date: nowDate(), time: nowTime() });
  } catch(e) { console.warn('SMS log xatosi:', e.message); }
}

async function incrementSmsCount(config, count) {
  count = count || 1;
  const newCount = (config.sms_sent_count || 0) + count;
  await fbPatch('sms_config', { sms_sent_count: newCount });
  return newCount;
}

// ── ROUTES ──────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'MoyTrack Backend', version: '4.5', firebase: FIREBASE_URL, time: new Date().toISOString(), uptime: Math.floor(process.uptime()) + 's', node: process.version });
});

app.get('/api', (req, res) => {
  res.json({
    service: 'MoyTrack API', version: '4.5',
    endpoints: [
      'GET  /health', 'GET  /api',
      'GET  /api/sms-config', 'POST /api/sms-config',
      'POST /api/sms/test', 'POST /api/sms/send', 'POST /api/sms/bulk',
      'POST /api/sms/service-change', 'POST /api/sms/car-saved', 'POST /api/sms/auto-check',
      'POST /api/sms/verify-token', 'POST /api/sms/reset-count',
      'GET  /api/sms/stats', 'GET  /api/sms/logs', 'DELETE /api/sms/logs',
      'GET  /api/firebase/ping',
    ],
  });
});

app.get('/api/sms-config', async (req, res) => {
  const r = await fbGet('sms_config');
  if (!r.ok) return res.status(502).json({ error: 'Firebase xatosi', detail: r.error });
  res.json({ ok: true, config: { ...DEFAULT_SMS, ...(r.data || {}) } });
});

app.post('/api/sms-config', async (req, res) => {
  const body = req.body || {};
  const data = {
    devsms_token: body.devsms_token ?? '', enabled: body.enabled ?? false,
    firebase_enabled: true, sms_sent_count: body.sms_sent_count ?? 0,
    test_phone: body.test_phone || '',
    save_message: body.save_message || DEFAULT_SMS.save_message,
    oil_message: body.oil_message || DEFAULT_SMS.oil_message,
    gearbox_message: body.gearbox_message || DEFAULT_SMS.gearbox_message,
    antifreeze_message: body.antifreeze_message || DEFAULT_SMS.antifreeze_message,
    air_filter_message: body.air_filter_message || DEFAULT_SMS.air_filter_message,
    cabin_filter_message: body.cabin_filter_message || DEFAULT_SMS.cabin_filter_message,
    oil_filter_message: body.oil_filter_message || DEFAULT_SMS.oil_filter_message,
    default_change_message: body.default_change_message || DEFAULT_SMS.default_change_message,
    updated_at: new Date().toISOString(),
  };
  const r = await fbPut('sms_config', data);
  if (!r.ok) return res.status(502).json({ error: 'Firebase saqlashda xato', detail: r.error });
  console.log('✅ sms_config Firebase ga saqlandi');
  res.json({ ok: true, message: 'Shablonlar saqlandi', data });
});

app.post('/api/sms/test', async (req, res) => {
  const { token, phone, template_key, template_override, car } = req.body || {};
  if (!token || !phone || !template_key) return res.status(400).json({ ok: false, error: 'token, phone, template_key majburiy' });
  const cfgRes = await fbGet('sms_config');
  const config = { ...DEFAULT_SMS, ...(cfgRes.data || {}) };
  const tmpl = template_override?.trim() || config[template_key] || DEFAULT_SMS[template_key] || DEFAULT_SMS.default_change_message;
  const testCar = { car_name: car?.car_name || 'Nexia 3', car_number: car?.car_number || '01A 123BC', total_km: car?.total_km || 85000, oil_name: car?.oil_name || 'SAE 5W-30' };
  const svcType = template_key.replace('_message', '');
  const text = fillTemplate(tmpl, testCar, svcType, SVC_META[svcType]?.label || svcType);
  const smsRes = await sendSms(token, phone, text);
  await saveSmsLog({ type: 'test', template_key, phone, message: text, ok: smsRes.ok, error: smsRes.error });
  res.json({ ok: smsRes.ok, sent_to: phone, text, template_used: tmpl, template_source: template_override ? 'override' : 'firebase', devsms: smsRes.data, error: smsRes.error });
});

app.post('/api/sms/send', async (req, res) => {
  const { token, phone, message } = req.body || {};
  if (!token || !phone || !message) return res.status(400).json({ ok: false, error: 'token, phone, message majburiy' });
  const smsRes = await sendSms(token, phone, message);
  if (smsRes.ok) { const cfgRes = await fbGet('sms_config'); if (cfgRes.ok && cfgRes.data) await incrementSmsCount(cfgRes.data); }
  await saveSmsLog({ type: 'direct', phone, message, ok: smsRes.ok, error: smsRes.error });
  res.json({ ok: smsRes.ok, sent_to: phone, devsms: smsRes.data, error: smsRes.error });
});

app.post('/api/sms/bulk', async (req, res) => {
  const { token, phones = [], message, delay_ms = 300 } = req.body || {};
  if (!token || !phones.length || !message) return res.status(400).json({ ok: false, error: 'token, phones, message majburiy' });
  if (phones.length > 100) return res.status(400).json({ ok: false, error: 'Maksimum 100 ta raqam' });
  const results = [];
  let okCount = 0;
  for (const phone of phones) {
    const smsRes = await sendSms(token, phone, message);
    results.push({ phone, ok: smsRes.ok, error: smsRes.error });
    if (smsRes.ok) okCount++;
    if (delay_ms > 0) await new Promise(r => setTimeout(r, delay_ms));
  }
  if (okCount > 0) { const cfgRes = await fbGet('sms_config'); if (cfgRes.ok && cfgRes.data) await incrementSmsCount(cfgRes.data, okCount); }
  await saveSmsLog({ type: 'bulk', phones_count: phones.length, message, ok: okCount > 0, ok_count: okCount });
  console.log(`📤 Bulk SMS: ${okCount}/${phones.length}`);
  res.json({ ok: true, total: phones.length, sent: okCount, failed: phones.length - okCount, results });
});

app.post('/api/sms/service-change', async (req, res) => {
  const { car, service_type, token } = req.body || {};
  if (!car || !service_type) return res.status(400).json({ error: 'car, service_type majburiy' });
  const cfgRes = await fbGet('sms_config');
  const config = { ...DEFAULT_SMS, ...(cfgRes.data || {}) };
  const smsToken = token || config.devsms_token;
  if (!smsToken)         return res.status(400).json({ error: 'devsms_token yoq' });
  if (!config.enabled)   return res.status(400).json({ error: 'SMS ochirilgan' });
  if (!car.phone_number) return res.status(400).json({ error: 'car.phone_number yoq' });
  const svcLabel = SVC_META[service_type]?.label || service_type;
  const tplKey   = service_type + '_message';
  const tmpl     = config[tplKey] || DEFAULT_SMS[tplKey] || DEFAULT_SMS.default_change_message;
  const text     = fillTemplate(tmpl, car, service_type, svcLabel);
  const smsRes   = await sendSms(smsToken, car.phone_number, text);
  if (smsRes.ok) await incrementSmsCount(config);
  await saveSmsLog({ type: 'service_change', service_type, car_name: car.car_name, phone: car.phone_number, message: text, ok: smsRes.ok, error: smsRes.error });
  res.json({ ok: smsRes.ok, sent_to: car.phone_number, service_type, text, devsms: smsRes.data, error: smsRes.error });
});

app.post('/api/sms/car-saved', async (req, res) => {
  const { car, checked_keys = [], token } = req.body || {};
  if (!car) return res.status(400).json({ error: 'car majburiy' });
  const cfgRes = await fbGet('sms_config');
  const config = { ...DEFAULT_SMS, ...(cfgRes.data || {}) };
  const smsToken = token || config.devsms_token;
  if (!smsToken || !config.enabled || !car.phone_number)
    return res.status(400).json({ error: 'Token yoq, SMS ochirilgan yoki telefon yoq' });
  const svcList = checked_keys.map(k => { const m = SVC_META[k]; return m ? `${m.icon} ${m.label}` : k; }).join(', ');
  const text = fillTemplate(config.save_message || DEFAULT_SMS.save_message, car, '', svcList);
  const smsRes = await sendSms(smsToken, car.phone_number, text);
  if (smsRes.ok) await incrementSmsCount(config);
  await saveSmsLog({ type: 'car_saved', car_name: car.car_name, phone: car.phone_number, message: text, ok: smsRes.ok, error: smsRes.error });
  res.json({ ok: smsRes.ok, sent_to: car.phone_number, text, devsms: smsRes.data, error: smsRes.error });
});

app.post('/api/sms/auto-check', async (req, res) => {
  const { cars = [], oils = [] } = req.body || {};
  const cfgRes = await fbGet('sms_config');
  const config = { ...DEFAULT_SMS, ...(cfgRes.data || {}) };
  if (!config.enabled || !config.devsms_token) return res.json({ ok: false, message: 'SMS yoqilmagan', sent: [] });
  const oilInt = name => { const o = oils.find(o => o.name === name); return o ? o.interval : 10000; };
  const sent = [];
  for (const car of cars) {
    if (!car.phone_number) continue;
    const checks = [
      { key: 'oil',          u: (car.total_km - car.oil_change_km) / oilInt(car.oil_name) },
      { key: 'antifreeze',   u: (car.total_km - car.antifreeze_km) / (car.antifreeze_interval || 30000) },
      { key: 'gearbox',      u: (car.total_km - car.gearbox_km) / (car.gearbox_interval || 50000) },
      { key: 'air_filter',   u: (car.total_km - (car.air_filter_km || car.total_km)) / (car.air_filter_interval || 15000) },
      { key: 'cabin_filter', u: (car.total_km - (car.cabin_filter_km || car.total_km)) / (car.cabin_filter_interval || 15000) },
      { key: 'oil_filter',   u: (car.total_km - (car.oil_filter_km || car.total_km)) / (car.oil_filter_interval || 10000) },
    ];
    for (const svc of checks) {
      if (svc.u >= 1.0) {
        const svcLabel = SVC_META[svc.key]?.label || svc.key;
        const tmpl = config[svc.key + '_message'] || DEFAULT_SMS[svc.key + '_message'] || DEFAULT_SMS.default_change_message;
        const text = fillTemplate(tmpl, car, svc.key, svcLabel);
        const smsRes = await sendSms(config.devsms_token, car.phone_number, text);
        await saveSmsLog({ type: 'auto_check', service_key: svc.key, car_name: car.car_name, phone: car.phone_number, message: text, ok: smsRes.ok, error: smsRes.error });
        sent.push({ car_name: car.car_name, service: svc.key, ok: smsRes.ok, text, error: smsRes.error });
      }
    }
  }
  const okCount = sent.filter(s => s.ok).length;
  if (okCount > 0) await incrementSmsCount(config, okCount);
  res.json({ ok: true, checked: cars.length, sent_count: sent.length, ok_count: okCount, sent });
});

app.post('/api/sms/verify-token', async (req, res) => {
  const { token } = req.body || {};
  if (!token) return res.status(400).json({ ok: false, error: 'token majburiy' });

  // Ikkala endpointni ham sinab ko'ramiz
  const endpoints = [
    'https://devsms.uz/api/get_balance.php',
    'https://devsms.uz/api/balance.php',
  ];

  for (const url of endpoints) {
    try {
      const r = await fetch(url, {
        method: 'GET',
        headers: { 'Authorization': 'Bearer ' + token },
        signal: AbortSignal.timeout(8000),
      });
      const text = await r.text();
      let data = {};
      try { data = JSON.parse(text); } catch(_) { data = { raw: text }; }

      console.log(`[verify-token] ${url} | HTTP ${r.status} | raw=${text.slice(0,300)}`);

      // Balansni har qanday formatdan olamiz
      const balance =
        data?.data?.balance ??
        data?.balance ??
        data?.data?.amount ??
        data?.amount ??
        null;

      // Token to'g'ri deb hisoblash shartlari
      const isOk =
        data?.success === true ||
        data?.status === 'success' ||
        balance !== null ||
        (r.ok && r.status === 200 && !data?.error && !data?.message?.toLowerCase().includes('invalid'));

      if (r.status !== 404) {
        // 404 bo'lmasa javob qaytaramiz (endpoint topildi)
        return res.json({ ok: isOk, balance, http_status: r.status, endpoint: url, data });
      }
    } catch (e) {
      console.warn(`[verify-token] ${url} xato:`, e.message);
    }
  }

  // Hamma endpoint ishlamadi
  res.json({ ok: false, error: 'devsms.uz ga ulanib bo'lmadi' });
});

app.post('/api/sms/reset-count', async (req, res) => {
  const r = await fbPatch('sms_config', { sms_sent_count: 0 });
  res.json({ ok: r.ok, message: r.ok ? 'Hisoblagich tiklandi' : 'Xato' });
});

app.get('/api/sms/stats', async (req, res) => {
  const cfgRes  = await fbGet('sms_config');
  const logsRes = await fbGet('sms_logs');
  const config  = cfgRes.data || {};
  const logs    = logsRes.data ? Object.values(logsRes.data).filter(Boolean) : [];
  const today   = nowDate();
  const byService = {};
  logs.forEach(l => { const k = l.service_type || l.service_key || l.type || 'other'; byService[k] = (byService[k] || 0) + 1; });
  res.json({
    ok: true,
    total_sent: config.sms_sent_count || 0,
    today_count: logs.filter(l => l.date === today).length,
    success_count: logs.filter(l => l.ok).length,
    fail_count: logs.filter(l => !l.ok).length,
    sms_enabled: !!config.enabled,
    has_token: !!config.devsms_token,
    by_service: byService,
    last_5: logs.slice(-5).reverse(),
  });
});

app.get('/api/sms/logs', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const type  = req.query.type || null;
  const logsRes = await fbGet('sms_logs');
  if (!logsRes.ok) return res.status(502).json({ error: 'Firebase xatosi' });
  let logs = logsRes.data ? Object.values(logsRes.data).filter(Boolean) : [];
  logs.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  if (type) logs = logs.filter(l => l.type === type);
  res.json({ ok: true, count: logs.slice(0, limit).length, logs: logs.slice(0, limit) });
});

app.delete('/api/sms/logs', async (req, res) => {
  const r = await fbPut('sms_logs', null);
  res.json({ ok: r.ok, message: r.ok ? 'SMS tarix tozalandi' : 'Xato' });
});

app.get('/api/firebase/ping', async (req, res) => {
  const start = Date.now();
  const r = await fbGet('_ping');
  res.json({ ok: r.ok, firebase_url: FIREBASE_URL, ping_ms: Date.now() - start });
});

app.use(express.static(path.join(__dirname)));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint topilmadi', path: req.path, tip: 'GET /api - royhatni korish uchun' });
});
app.use((err, req, res, next) => {
  console.error('Server xatosi:', err);
  res.status(500).json({ error: 'Server ichki xatosi', message: err.message });
});

app.listen(PORT, () => {
  console.log('\n🚀 MoyTrack Backend v4.5 ishga tushdi!');
  console.log(`   Port    : http://localhost:${PORT}`);
  console.log(`   Firebase: ${FIREBASE_URL}`);
  console.log('\n📌 Endpointlar:');
  console.log(`   GET  /health, /api`);
  console.log(`   GET/POST /api/sms-config`);
  console.log(`   POST /api/sms/test|send|bulk|service-change|car-saved|auto-check|verify-token|reset-count`);
  console.log(`   GET  /api/sms/stats|logs`);
  console.log(`   DELETE /api/sms/logs\n`);
});
