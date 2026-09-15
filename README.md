# 🏢 Jelenlét Nyilvántartó Rendszer

## Rendszer áttekintése

**Backend:** Node.js + Express + NeDB (beágyazott adatbázis, nincs szükség külső DB-re)  
**Admin webalkalmazás:** Böngészőalapú dashboard  
**Mobil terminál:** Progressive Web App (PWA) – NFC + QR kód + PIN

---

## Telepítés és indítás

### Előfeltételek
- Node.js v16 vagy újabb
- npm

### Telepítés
```bash
cd attendance-system
npm install
```

### Indítás
```bash
node server.js
```

A szerver elindul a http://localhost:3000 címen.

---

## Elérési útvonalak

| URL | Leírás |
|-----|--------|
| `http://localhost:3000` | Admin dashboard |
| `http://localhost:3000/mobile` | Mobil terminál |

### Admin belépés (alapértelmezett)
- **Email:** admin@company.hu  
- **Jelszó:** Admin1234!

> ⚠️ Első belépés után változtassa meg a jelszót a Beállítások menüben!

---

## Funkciók

### Admin dashboard
- ✅ Mai jelenlét áttekintő (valós idejű)
- ✅ Eseménynapló szűrhetővén (dátum, típus)
- ✅ Heti / havi / egyéni kimutatások
- ✅ CSV export (Excel kompatibilis)
- ✅ Dolgozók kezelése (hozzáadás, szerkesztés, deaktiválás)
- ✅ QR kód megtekintés és nyomtatás
- ✅ NFC tag konfiguráció
- ✅ Kézi bejegyzés lehetősége
- ✅ Jogosultság kezelés (admin / manager)

### Mobil terminál (PWA)
- ✅ NFC tag beolvasás (Android Chrome 86+, Web NFC API)
- ✅ QR kód szkennelés (kamerával)
- ✅ Kézi QR kód megadás (kamera nélkül)
- ✅ PIN kód azonosítás (billentyűzet)
- ✅ Automatikus be/kilépés meghatározás
- ✅ Telepíthető homescreen-re (PWA)

---

## NFC Tag beállítás

### Szükséges tag típus
NDEF formátumú NFC tag (ajánlott: **NTAG213**, **NTAG215**, **NTAG216**)

### Programozás (Android, NFC Tools alkalmazással)
1. Telepítse a [NFC Tools](https://play.google.com/store/apps/details?id=com.wakdev.wdnfc) alkalmazást
2. Hozzon létre új szöveges rekordot a tagen
3. Írja be a Tag ID-t: pl. `NFC-ENTRY-001`
4. Az admin dashboardon adja hozzá ugyanezt a Tag ID-t az NFC Tag konfigurációban

### Tag típusok
- **entry** = Bejárat tag → érkezés rögzítése
- **exit** = Kijárat tag → távozás rögzítése

---

## Demo adatok

Az indítás után automatikusan létrejönnek:

**Demo dolgozók:**
| Név | QR kód | PIN |
|-----|--------|-----|
| Nagy Péter | EMP-001 | 1234 |
| Kovács Anna | EMP-002 | 2345 |
| Szabó János | EMP-003 | 3456 |
| Horváth Éva | EMP-004 | 4567 |
| Tóth Miklós | EMP-005 | 5678 |

**Demo NFC tagek:**
- `NFC-ENTRY-001` – Főbejárat
- `NFC-EXIT-001` – Főkijárat
- `NFC-ENTRY-002` – Hátsó bejárat
- `NFC-EXIT-002` – Hátsó kijárat

---

## Éles bevezetési útmutató

### 1. Szerver konfigurálás
```bash
# Port megadása
PORT=80 node server.js

# Vagy háttérben futtatás PM2-vel
npm install -g pm2
pm2 start server.js --name attendance
pm2 startup
pm2 save
```

### 2. HTTPS beállítás (NFC-hez kötelező!)
Az NFC Web API csak HTTPS kapcsolaton működik. Ajánlott:
- **Nginx reverse proxy** + Let's Encrypt tanúsítvány
- **ngrok** teszteléshez: `ngrok http 3000`

### 3. Mobil telepítés
A mobil terminált Android Chrome böngészőben nyissa meg, majd:
"⋮ > Hozzáadás a főképernyőhöz" → Telepítés

---

## API dokumentáció

### Autentikáció
```
POST /api/auth/login
Body: { email, password }
→ { token, user }
```

### Jelenlét azonosítás (terminál – auth nélkül)
```
POST /api/attendance/identify
Body: { qrCode, pin, nfcTagId? }
→ { success, eventType, employee, timestamp, message }
```

### Kimutatás lekérés
```
GET /api/attendance/report?dateFrom=2024-01-01&dateTo=2024-01-31
Authorization: Bearer <token>
```

---

## Adatbázis

Az adatok a `data/` mappában tárolódnak NeDB formátumban (JSON fájlok):
- `data/employees.db` – Dolgozók
- `data/attendance.db` – Jelenlét napló
- `data/nfc_tags.db` – NFC tagek
- `data/users.db` – Admin felhasználók

> Biztonsági mentéshez elegendő a `data/` mappát másolni.
