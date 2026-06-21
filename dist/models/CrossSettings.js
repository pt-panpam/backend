"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrossSettings = void 0;
exports.initCrossSettings = initCrossSettings;
const sequelize_1 = require("sequelize");
class CrossSettings extends sequelize_1.Model {
    canChange() {
        const tenDays = 10 * 24 * 60 * 60 * 1000;
        return Date.now() - new Date(this.updated_at).getTime() >= tenDays;
    }
}
exports.CrossSettings = CrossSettings;
function initCrossSettings(sequelize) {
    CrossSettings.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, unique: true, field: 'user_id' },
        reviewHour: { type: sequelize_1.DataTypes.INTEGER, defaultValue: 21, field: 'review_hour' },
        reviewMinute: { type: sequelize_1.DataTypes.INTEGER, defaultValue: 0, field: 'review_minute' },
        revealDelayMinutes: { type: sequelize_1.DataTypes.INTEGER, defaultValue: 60, field: 'reveal_delay_minutes' },
    }, { sequelize, tableName: 'cross_settings', timestamps: true, underscored: true });
}
//# sourceMappingURL=CrossSettings.js.map