"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, next) {
    console.error('Error:', err.message);
    res.status(500).json({ error: err.message || 'Internal server error' });
}
//# sourceMappingURL=errorHandler.js.map