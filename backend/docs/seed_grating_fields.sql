-- ═══════════════════════════════════════════════════════════════
-- Seed: custom fields untuk template Grating (template_key='grating')
-- Target DB  : PLhamasa (DB PLM) di EC2 16.79.81.18
-- Cara run   : psql -h 16.79.81.18 -U <user> -d PLhamasa -f seed_grating_fields.sql
-- Idempotent : ON CONFLICT DO NOTHING — aman dijalankan ulang
-- ═══════════════════════════════════════════════════════════════

-- BACKUP sebelum run (jalankan di psql dulu):
--   CREATE TABLE pdf_template_field_value_bak_grating AS
--       SELECT * FROM pdf_template_field_value WHERE template_key = 'grating';

-- ── ig_id 208: Grating 1" x 3/16" x 3' x 20' A ──────────────────
INSERT INTO pdf_template_field_value (template_key, ig_id, field_key, value)
VALUES
    ('grating', 208, 'tinggi_inch', '1'),
    ('grating', 208, 'tebal_inch',  '3/16'),
    ('grating', 208, 'lebar_ft',    '3'),
    ('grating', 208, 'panjang_ft',  '20'),
    ('grating', 208, 'grade',       'A')
ON CONFLICT (template_key, ig_id, field_key) DO NOTHING;

-- ── ig_id 209: Grating 1 1/2" x 3/16" x 3' x 20' ────────────────
INSERT INTO pdf_template_field_value (template_key, ig_id, field_key, value)
VALUES
    ('grating', 209, 'tinggi_inch', '1 1/2'),
    ('grating', 209, 'tebal_inch',  '3/16'),
    ('grating', 209, 'lebar_ft',    '3'),
    ('grating', 209, 'panjang_ft',  '20'),
    ('grating', 209, 'grade',       'A')
ON CONFLICT (template_key, ig_id, field_key) DO NOTHING;

-- ── ig_id 210: Grating 1 1/4" x 3/16" x 3' x 20' ────────────────
INSERT INTO pdf_template_field_value (template_key, ig_id, field_key, value)
VALUES
    ('grating', 210, 'tinggi_inch', '1 1/4'),
    ('grating', 210, 'tebal_inch',  '3/16'),
    ('grating', 210, 'lebar_ft',    '3'),
    ('grating', 210, 'panjang_ft',  '20'),
    ('grating', 210, 'grade',       'A')
ON CONFLICT (template_key, ig_id, field_key) DO NOTHING;

-- ── ig_id 7337: Grating 1" x 3/16" x 90cm x 6m B (dikonversi ke ft) ──
-- 90 cm → 3 ft  |  6 m → 20 ft
INSERT INTO pdf_template_field_value (template_key, ig_id, field_key, value)
VALUES
    ('grating', 7337, 'tinggi_inch', '1'),
    ('grating', 7337, 'tebal_inch',  '3/16'),
    ('grating', 7337, 'lebar_ft',    '3'),
    ('grating', 7337, 'panjang_ft',  '20'),
    ('grating', 7337, 'grade',       'A')
ON CONFLICT (template_key, ig_id, field_key) DO NOTHING;

-- ── Verify (jalankan setelah insert) ──────────────────────────────
-- SELECT ig_id, field_key, value
-- FROM pdf_template_field_value
-- WHERE template_key = 'grating'
-- ORDER BY ig_id, field_key;
-- Expected: 20 rows (4 ig_id × 5 field)

-- ── category_dimension_config ─────────────────────────────────────
-- Grating tidak perlu require_tebal=true (dimensi inch/ft, bukan mm).
-- Service defaults to require_tebal=false jika tidak ada entry.
-- Entry di bawah optional — uncomment kalau ingin konsisten dengan
-- kategori lain yang punya entry di tabel ini.
--
-- INSERT INTO category_dimension_config (cat_id, cat_name, require_tebal)
-- VALUES ('GRAT', 'Grating', false)
-- ON CONFLICT (cat_id) DO NOTHING;
