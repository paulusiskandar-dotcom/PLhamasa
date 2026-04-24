# Price List Manager — Backend

Backend API untuk aplikasi Price List Manager. Mengelola data harga barang besi dan export ke format ERP maupun Manual.

## Tech Stack
- Node.js + Express
- PostgreSQL (via pg-promise)
- ExcelJS (export .xlsx)
- JWT Authentication

## Setup

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env
# Edit .env sesuai konfigurasi DB

# Buat database & jalankan schema
psql -U postgres -d your_db -f docs/schema.sql

# Jalankan server
npm run dev   # development (nodemon)
npm start     # production
```

## API Endpoints

### Auth
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/auth/login` | Login user |
| POST | `/auth/logout` | Logout |

### Items
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/items` | List barang (filter: category_name, brand_name, grade_id, group_id, item_name) |
| GET | `/items/:ig_id` | Detail barang |

### Price
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| GET | `/price/types` | Daftar tipe harga |
| POST | `/price/info` | Harga per kg dari list ig_ids |
| POST | `/price/save` | Simpan & log perubahan harga |

### Export
| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| POST | `/export/erp` | Export Price List format ERP (PLETL) |
| POST | `/export/manual` | Export Price List format Manual |

## Struktur Folder
```
├── app.js              # Entry point
├── router.js           # Route definitions
├── configs/
│   └── database.js     # PostgreSQL config
├── controllers/
│   ├── authentication.js
│   ├── item.js
│   ├── price.js
│   └── exportPrice.js  # Export ERP & Manual
├── models/
│   ├── item.js
│   └── price.js
├── middleware/
│   └── auth.js         # JWT verify
├── utils/
│   ├── response.js
│   └── excel.js        # ExcelJS export functions
├── docs/
│   └── schema.sql      # Database schema
└── public/
    └── tmp_file/       # Temporary export files
```
