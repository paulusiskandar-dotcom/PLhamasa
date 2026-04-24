const jwt = require("jsonwebtoken");
const response = require("../utils/response");

const JWT_SECRET = process.env.JWT_SECRET || "price_list_secret";

// Dummy users — ganti dengan query ke DB users
const USERS = [
    { id: 1, username: "admin", password: "admin123", role: "admin" },
];

module.exports._login = function (req, res) {
    const { username, password } = req.body;

    const user = USERS.find(u => u.username === username && u.password === password);
    if (!user) {
        return response.error(res, "invalid_credentials", null, 401);
    }

    const token = jwt.sign(
        { id: user.id, username: user.username, role: user.role },
        JWT_SECRET,
        { expiresIn: "8h" }
    );

    return response.success(res, { accessToken: token, user: { id: user.id, username: user.username, role: user.role } });
};

module.exports._logout = function (req, res) {
    // JWT stateless — client cukup hapus token
    return response.success(res, null, "Logged out");
};
