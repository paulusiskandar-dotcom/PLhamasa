/*
 * rounding.js — Single Source of Truth for Price Rounding
 *
 * Rule (sisa <= 50):
 * - Calculate sisa = Math.round(raw) % 100
 * - If sisa <= 50 -> Math.floor(raw / 100) * 100
 * - If sisa > 50  -> Math.ceil(raw / 100) * 100
 */

function roundSpecial(raw) {
    if (!raw && raw !== 0) return 0;
    const sisa = Math.round(raw) % 100;
    return sisa <= 50 ? Math.floor(raw / 100) * 100 : Math.ceil(raw / 100) * 100;
}

module.exports = {
    roundSpecial,
};
