"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Notification = void 0;
exports.initNotification = initNotification;
const sequelize_1 = require("sequelize");
class Notification extends sequelize_1.Model {
}
exports.Notification = Notification;
function initNotification(sequelize) {
    Notification.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user_id' },
        type: { type: sequelize_1.DataTypes.STRING(30), allowNull: false },
        title: { type: sequelize_1.DataTypes.STRING(255), allowNull: false },
        body: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        actorId: { type: sequelize_1.DataTypes.INTEGER, allowNull: true, field: 'actor_id' },
        postId: { type: sequelize_1.DataTypes.INTEGER, allowNull: true, field: 'post_id' },
        isRead: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: false, field: 'is_read' },
    }, { sequelize, tableName: 'notifications', timestamps: true, underscored: true });
}
//# sourceMappingURL=Notification.js.map