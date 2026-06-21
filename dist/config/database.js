"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sequelize = void 0;
exports.initDatabase = initDatabase;
const sequelize_1 = require("sequelize");
const path_1 = __importDefault(require("path"));
const env_1 = require("./env");
const dbPath = path_1.default.resolve(__dirname, '../..', env_1.env.DB_PATH);
exports.sequelize = new sequelize_1.Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: false,
    define: {
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
    },
});
async function initDatabase() {
    await exports.sequelize.authenticate();
    await exports.sequelize.sync({ alter: false });
    // Manually add missing columns (SQLite ALTER TABLE is limited)
    const migrations = [
        'ALTER TABLE `users` ADD COLUMN `is_live` TINYINT(1) DEFAULT 0;',
        'ALTER TABLE `cross_settings` ADD COLUMN `reveal_delay_minutes` INTEGER DEFAULT 60;',
    ];
    for (const sql of migrations) {
        try {
            await exports.sequelize.query(sql);
        }
        catch { /* column already exists */ }
    }
    console.log('Database connected and synced');
}
//# sourceMappingURL=database.js.map