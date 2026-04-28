const jwt      = require('jsonwebtoken');
const response = require('../utils/response');
const userModel = require('../models/user');

const JWT_SECRET = process.env.JWT_SECRET || 'price_list_secret';

module.exports._login = async function (req, res) {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return response.error(res, 'Username dan password wajib diisi', null, 400);
        }

        const user = await userModel.login(username, password);

        const token = jwt.sign(
            { id: user.id, username: user.username, role: user.role },
            JWT_SECRET,
            { expiresIn: '24h' }
        );

        return response.success(res, {
            accessToken: token,
            user: {
                id:        user.id,
                username:  user.username,
                role:      user.role,
                full_name: user.full_name || user.username,
            },
        });
    } catch (err) {
        return response.error(res, err.message, null, 401);
    }
};

module.exports._logout = function (req, res) {
    return response.success(res, null, 'Logged out');
};
