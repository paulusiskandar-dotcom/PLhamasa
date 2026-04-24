# PLhamasa — Backend

Backend API untuk Price List Manager Hamasa. Mengelola harga besi dan export ke format ERP / Manual.

## Arsitektur Dual Database

```
┌─────────────────────────────────┐     ┌─────────────────────────────────┐
│      DB ERP (READ ONLY)         │     │   DB PLhamasa (READ + WRITE)    │
│                                 │     │                                 │
│  • item          (master data)  │     │  • item_price (harga per kg)    │
│  • item_category                │     │  • price_log  (riwayat)         │
│  • price         (price types)  │     │  • users                        │
│  • item_price    (harga FINAL)  │     │                                 │
└─────────────────────────────────┘     └─────────────────────────────────┘
           ▲                                          ▲
           │                                          │
           └──────────── Backend ─────────────────────┘
                         PLhamasa
```

**Penting:**
- **DB ERP** menyimpan harga **FINAL** per unit (`harga_per_kg × berat`)
- **DB PLhamasa** menyimpan harga **PER KG** (input user)
- Saat export ERP: harga per kg × berat → round → tulis ke template

## Tech Stack
- Node.js + Express
- PostgreSQL (dual connection via pg-promise)
- ExcelJS (export .xlsx)
- JWT Authentication

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env & isi kredensial DB
cp .env.example .env
# Edit .env: isi kredensial DB ERP + DB PLhamasa

# 3. Buat DB PLhamasa (DB baru, TERPISAH dari ERP)
createdb plhamasa_db
psql -d plhamasa_db -f docs/schema.sql

# 4. Jalankan server
npm run dev   # development
npm start     # production
```

## Environment Variables

```env
PORT=3001

# DB ERP (read-only, host remote)
ERP_DB_HOST=your-erp-server.com
ERP_DB_PORT=5432
ERP_DB_NAME=erp_db
ERP_DB_USER=readonly_user
ERP_DB_PASS=xxx

# DB PLhamasa (lokal, read+write)
PLM_DB_HOST=localhost
PLM_DB_PORT=5432
PLM_DB_NAME=plhamasa_db
PLM_DB_USER=postgres
PLM_DB_PASS=xxx

JWT_SECRET=random_secret_string
```

## API Endpoints

### Auth
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/auth/login` | Login user |
| POST | `/auth/logout` | Logout |

### Items (baca dari DB ERP)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/items?cat_id=...&brand_id=...&item_name=...` | Cari barang |
| GET | `/items/:ig_id` | Detail barang |

### Price (baca+tulis DB PLhamasa)
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/price/types` | Daftar tipe harga (dari DB ERP) |
| POST | `/price/info` | Harga per kg (dari DB PLhamasa) |
| POST | `/price/save` | Simpan & log perubahan harga |

### Export
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/export/erp` | Export Price List format ERP (PLETL) |
| POST | `/export/manual` | Export Price List format Manual |

## Struktur Folder
```
├── app.js                    # Entry point, init dual DB globals
├── router.js                 # Route definitions
├── configs/
│   └── database.js           # PostgreSQL dual connection (dbERP + dbPLM)
├── controllers/
│   ├── authentication.js
│   ├── item.js               # baca DB ERP
│   ├── price.js              # baca+tulis DB PLhamasa
│   └── exportPrice.js        # Export ERP & Manual
├── models/
│   ├── item.js               # query DB ERP
│   └── price.js              # query DB PLhamasa
├── middleware/
│   └── auth.js               # JWT verify
├── utils/
│   ├── response.js
│   └── excel.js              # ExcelJS export functions
├── docs/
│   └── schema.sql            # Schema DB PLhamasa (BUKAN ERP!)
└── public/
    └── tmp_file/             # Temporary export files
```

## Tabel DB ERP yang diakses (READ ONLY)

| Tabel | Kolom utama yang dipakai |
|-------|--------------------------|
| `item` | `ig_id, i_id, i_name, i_weight, i_group, i_brand, serial_id, cat_id, grade, deleted_at` |
| `item_category` | `cat_id, cat_name, unit, unit_code, type_code, type` |
| `price` | `pr_id, pr_code, pr_name` |
| `item_price` | `ig_id, pr_id, i_price` (harga final per unit) |

**Rekomendasi:** Buat user PostgreSQL khusus `readonly_user` yang hanya punya akses `SELECT` ke 4 tabel di atas.
