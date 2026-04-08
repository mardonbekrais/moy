# MoyTrack — final optimallashtirilgan versiya

## SMS uchun 2 ta tasdiqlatish shabloni

1. Xizmat bajarildi

Hurmatli mijoz, {car_name} ({car_number}) avtomobili bo'yicha quyidagi ma'lumot qayd etildi: {service_name}.
Sana: {date}.
Joriy probeg: {km} km.

2. Xizmat muddati keldi

Hurmatli mijoz, {car_name} ({car_number}) avtomobili bo'yicha quyidagi xizmatni bajarish tavsiya etiladi: {service_name}.
Sana: {date}.
Joriy probeg: {km} km.

## Muhim

- Frontend bazaga to'g'ridan-to'g'ri ulanmaydi.
- Asosiy saqlash: Firebase Realtime Database.
- SMS token `.env` ichidagi `DEVSMS_TOKEN` orqali backenddan ishlatiladi.
- Agar panel orqali token saqlansa, u baza ichidagi `sms_config` ga yoziladi.
- Render free rejimida schedule exact-second emas, server uyg'ongan paytda davom etadi.

## Kerakli `.env`

- FIREBASE_URL
- FIREBASE_SERVICE_ACCOUNT_JSON
- DEVSMS_TOKEN
- APP_PIN
- SESSION_SECRET
