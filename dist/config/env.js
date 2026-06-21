"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, '../../.env') });
exports.env = {
    PORT: parseInt(process.env.PORT || '8000', 10),
    JWT_SECRET: process.env.JWT_SECRET || 'dev-secret-change-in-production',
    JWT_ACCESS_EXPIRES_IN: process.env.JWT_ACCESS_EXPIRES_IN || '24h',
    JWT_REFRESH_EXPIRES_IN: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    DB_PATH: process.env.DB_PATH || './db.sqlite3',
    UPLOAD_DIR: process.env.UPLOAD_DIR || './uploads',
    CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:8081,http://127.0.0.1:8081').split(','),
    REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
    PG_DATABASE_URL: process.env.PG_DATABASE_URL || 'postgresql://localhost:5432/icross',
    H3_RESOLUTION: parseInt(process.env.H3_RESOLUTION || '9', 10),
};
//# sourceMappingURL=env.js.map