module.exports.success = function (res, data, message) {
    return res.status(200).json({
        status: "success",
        message: message || "OK",
        result: data,
    });
};

module.exports.error = function (res, message, err, code) {
    if (err) console.error("[Error]", err);
    return res.status(code || 500).json({
        status: "error",
        message: message || "Internal server error",
    });
};
