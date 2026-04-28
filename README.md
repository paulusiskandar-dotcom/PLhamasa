# PLhamasa — Price List Manager

Monorepo Price List Manager untuk export PL ERP & PL Manual.

## Database

PLhamasa pakai dual database, semua hosted di AWS / remote:

| DB | Host | Akses |
|----|------|-------|
| PLhamasa (read+write) | EC2 `16.79.81.18` | credentials di `backend/.env` di EC2 |
| ERP (read-only) | `167.99.68.20` | credentials di `backend/.env` di EC2 |

> **Jangan buat file `.env` di Mac Mini lokal.** Semua perubahan DB lewat `schema.sql` + GitHub Actions auto-deploy ke EC2.

### Update Schema DB

1. Edit `backend/docs/schema.sql` — pakai `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
2. Commit + push ke `main`
3. GitHub Actions auto-apply ke DB AWS

### Akses DB AWS Manual

```bash
ssh ubuntu@16.79.81.18
# lalu:
sudo -u postgres psql -d PLhamasa
# atau pakai credentials dari .env:
source /home/ubuntu/source/PLhamasa/backend/.env
PGPASSWORD=$PLM_DB_PASS psql -h $PLM_DB_HOST -U $PLM_DB_USER -d $PLM_DB_NAME
```

## Struktur
- `backend/` — Node.js + Express + PostgreSQL
- `frontend/` — Node.js + Express + Pug + AngularJS

## Auto-Deploy Setup

PLhamasa auto-deploy ke EC2 setiap push ke `main` lewat GitHub Actions.

### One-time Setup

1. Generate SSH key di lokal:
   ```bash
   ssh-keygen -t ed25519 -C "github-actions-plhamasa" -f ~/.ssh/plhamasa_deploy_key
   ```

2. Tambahkan public key ke EC2:
   ```bash
   cat ~/.ssh/plhamasa_deploy_key.pub | ssh ubuntu@16.79.81.18 "cat >> ~/.ssh/authorized_keys"
   ```

3. Tambahkan private key sebagai GitHub Secret:
   - Buka https://github.com/paulusiskandar-dotcom/PLhamasa/settings/secrets/actions
   - Klik **New repository secret**
   - Name: `EC2_SSH_KEY`
   - Value: paste isi file `~/.ssh/plhamasa_deploy_key` (private key, bukan `.pub`)
   - Save

4. Test deploy:
   - Push commit ke main
   - Cek: https://github.com/paulusiskandar-dotcom/PLhamasa/actions

### Workflow saat development

```bash
git add .
git commit -m "your message"
git push origin main
# auto-deploy jalan dalam ~30-60 detik
```

### Manual deploy (tanpa push)

- Buka https://github.com/paulusiskandar-dotcom/PLhamasa/actions
- Klik workflow **Deploy to EC2**
- Klik **Run workflow** → pilih branch main → **Run workflow**


