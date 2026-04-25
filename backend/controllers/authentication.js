const jwt    = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const response = require("../utils/response");

const JWT_SECRET = process.env.JWT_SECRET || "price_list_secret";

module.exports._login = async function (req, res) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return response.error(res, "invalid_credentials", null, 401);
        }

        const user = await global.dbPLM.oneOrNone(
            "SELECT id, username, password_hash, role, full_name FROM users WHERE username = $1 AND deleted_at IS NULL",
            [username]
        );
        if (!user) {
            return response.error(res, "invalid_credentials", null, 401);
        }

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) {
            return response.error(res, "invalid_credentials", null, 401);
        }

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: "24h" }
        );

        return response.success(res, {
            accessToken: token,
            user: {
                id: user.id,
                username: user.username,
                role: user.role,
                full_name: user.full_name || user.username,
            },
        });
    } catch (err) {
        return response.error(res, null, err);
    }
};

module.exports._logout = function (req, res) {
    // JWT stateless — client cukup hapus token
    return response.success(res, null, "Logged out");
};
