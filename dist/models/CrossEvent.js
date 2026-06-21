"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrossEvent = void 0;
exports.initCrossEvent = initCrossEvent;
const sequelize_1 = require("sequelize");
class CrossEvent extends sequelize_1.Model {
}
exports.CrossEvent = CrossEvent;
function initCrossEvent(sequelize) {
    CrossEvent.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        user1Id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user1_id' },
        user2Id: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user2_id' },
        latitude: { type: sequelize_1.DataTypes.FLOAT, allowNull: false },
        longitude: { type: sequelize_1.DataTypes.FLOAT, allowNull: false },
        crossedAt: { type: sequelize_1.DataTypes.DATE, defaultValue: sequelize_1.DataTypes.NOW, field: 'crossed_at' },
        published: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: false },
    }, { sequelize, tableName: 'cross_events', timestamps: true, underscored: true });
}
//# sourceMappingURL=CrossEvent.js.map