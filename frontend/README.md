# Price List Manager — Frontend

Frontend dashboard internal untuk Price List Manager. Dibangun dengan Node.js (Express + Pug) dan AngularJS.

## Tech Stack
- Node.js + Express (server-side render)
- Pug (template engine)
- AngularJS 1.8
- Bootstrap 5 + Bootstrap Icons
- IBM Plex Sans & IBM Plex Mono (fonts)

## Setup

```bash
# Install dependencies
npm install

# Jalankan frontend
npm run dev   # development (nodemon)
npm start     # production
```

Pastikan backend sudah berjalan di port 3001 (atau sesuaikan `API_URL` di `.env`).

## Environment Variables

```env
PORT=3000
API_URL=http://localhost:3001/
```

## Struktur Folder
```
├── engine.js           # Entry point
├── router/
│   ├── login.js
│   ├── logout.js
│   └── priceList.js
├── middleware/
│   └── auth.js         # Cookie check redirect
└── www/
    ├── view/
    │   ├── master.pug
    │   ├── login.pug
    │   └── priceList.pug
    ├── css/
    │   └── main.css
    └── js/
        ├── app.js
        ├── services/
        │   ├── auth.js
        │   ├── item.js
        │   ├── price.js
        │   └── exportPrice.js
        └── controller/
            └── priceList/
                └── priceListController.js
```

## Fitur
- 🔍 Cari barang by kategori, merek, golongan, nama
- 💰 Lihat harga cash & kredit per kg (sebelum & sesudah)
- ⚡ Generate harga baru otomatis (±Rp / ±%)
- 📥 Import template per kilo (.xlsx)
- 📤 Export PL ERP (format PLETL)
- 📤 Export PL Manual (format rapi untuk distribusi)
- 💾 Simpan & Export sekaligus
