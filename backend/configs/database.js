const pgp = require("pg-promise")();

const config = {
    host:     process.env.DB_HOST     || "localhost",
    port:     process.env.DB_PORT     || 5432,
    database: process.env.DB_NAME     || "price_list_manager",
    user:     process.env.DB_USER     || "postgres",
    password: process.env.DB_PASS     || "postgres",
};

const db = pgp(config);

module.exports = { db, pgp };
