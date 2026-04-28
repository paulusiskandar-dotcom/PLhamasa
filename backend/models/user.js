const bcrypt = require('bcrypt');

const dbPLM = () => global.dbPLM;

const SALT_ROUNDS        = 10;
const MAX_FAILED         = 5;
const LOCK_DURATION_MS   = 15 * 60 * 1000;

module.exports = {

    async listAll() {
        return dbPLM().any(`
            SELECT id, username, full_name, role, created_at,
                   failed_login_attempts, locked_until
            FROM users
            WHERE deleted_at IS NULL
            ORDER BY
                CASE role WHEN 'superadmin' THEN 1 ELSE 2 END,
                username ASC
        `);
    },

    async getById(id) {
        return dbPLM().oneOrNone(
            'SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL',
            [id]
        );
    },

    async getByUsername(username) {
        return dbPLM().oneOrNone(
            'SELECT * FROM users WHERE LOWER(username) = LOWER($1) AND deleted_at IS NULL',
            [username]
        );
    },

    async create({ username, password, full_name, role }) {
        if (!username || username.length < 3 || username.length > 50)
            throw new Error('Username harus 3-50 karakter');
        if (!/^[a-zA-Z0-9_.]+$/.test(username))
            throw new Error('Username hanya boleh huruf, angka, underscore, atau titik');
        if (!password || password.length < 8)
            throw new Error('Password minimal 8 karakter');
        if (!['superadmin', 'user'].includes(role))
            throw new Error('Role tidak valid');

        const existing = await this.getByUsername(username);
        if (existing) throw new Error('Username sudah dipakai');

        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        return dbPLM().one(
            `INSERT INTO users (username, password_hash, full_name, role)
             VALUES (LOWER($1), $2, $3, $4)
             RETURNING id, username, full_name, role, created_at`,
            [username, hash, full_name || username, role]
        );
    },

    async update(id, { full_name, role }) {
        if (role && !['superadmin', 'user'].includes(role))
            throw new Error('Role tidak valid');

        const fields = [];
        const params = [id];
        let idx = 2;

        if (full_name !== undefined) { fields.push(`full_name = $${idx++}`); params.push(full_name); }
        if (role !== undefined)      { fields.push(`role = $${idx++}`);      params.push(role); }
        if (!fields.length) throw new Error('Tidak ada perubahan');

        return dbPLM().one(
            `UPDATE users SET ${fields.join(', ')} WHERE id = $1 AND deleted_at IS NULL
             RETURNING id, username, full_name, role`,
            params
        );
    },

    async resetPassword(userId, newPassword) {
        if (!newPassword || newPassword.length < 8)
            throw new Error('Password minimal 8 karakter');
        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await dbPLM().none(
            `UPDATE users SET password_hash = $2, password_changed_at = NOW(),
             failed_login_attempts = 0, locked_until = NULL
             WHERE id = $1 AND deleted_at IS NULL`,
            [userId, hash]
        );
        return { success: true };
    },

    async changeOwnPassword(userId, oldPassword, newPassword) {
        if (!newPassword || newPassword.length < 8)
            throw new Error('Password baru minimal 8 karakter');
        const user = await this.getById(userId);
        if (!user) throw new Error('User tidak ditemukan');
        const valid = await bcrypt.compare(oldPassword, user.password_hash);
        if (!valid) throw new Error('Password lama salah');
        const sameAsOld = await bcrypt.compare(newPassword, user.password_hash);
        if (sameAsOld) throw new Error('Password baru tidak boleh sama dengan password lama');
        const hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
        await dbPLM().none(
            `UPDATE users SET password_hash = $2, password_changed_at = NOW() WHERE id = $1`,
            [userId, hash]
        );
        return { success: true };
    },

    async softDelete(userId, deletedByUserId) {
        if (userId === deletedByUserId)
            throw new Error('Tidak bisa hapus akun sendiri');
        const target = await this.getById(userId);
        if (!target) throw new Error('User tidak ditemukan');
        if (target.role === 'superadmin') {
            const admins = await dbPLM().any(
                `SELECT id FROM users WHERE role = 'superadmin' AND deleted_at IS NULL`
            );
            if (admins.length === 1) throw new Error('Tidak bisa hapus superadmin terakhir');
        }
        await dbPLM().none(`UPDATE users SET deleted_at = NOW() WHERE id = $1`, [userId]);
        return { success: true };
    },

    async login(username, password) {
        const user = await this.getByUsername(username);
        if (!user) throw new Error('Username atau password salah');

        if (user.locked_until && new Date(user.locked_until) > new Date()) {
            const mins = Math.ceil((new Date(user.locked_until) - new Date()) / 60000);
            throw new Error(`Akun terkunci. Coba lagi dalam ${mins} menit.`);
        }

        const valid = await bcrypt.compare(password, user.password_hash);

        if (!valid) {
            const attempts = (user.failed_login_attempts || 0) + 1;
            if (attempts >= MAX_FAILED) {
                const lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
                await dbPLM().none(
                    `UPDATE users SET failed_login_attempts = $2, locked_until = $3 WHERE id = $1`,
                    [user.id, attempts, lockUntil]
                );
                throw new Error(`Login gagal ${MAX_FAILED}x. Akun terkunci 15 menit.`);
            }
            await dbPLM().none(
                `UPDATE users SET failed_login_attempts = $2 WHERE id = $1`,
                [user.id, attempts]
            );
            const remaining = MAX_FAILED - attempts;
            throw new Error(`Username atau password salah. Sisa ${remaining}x sebelum akun terkunci.`);
        }

        await dbPLM().none(
            `UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1`,
            [user.id]
        );
        return user;
    },
};
