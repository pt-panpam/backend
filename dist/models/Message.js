"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Message = void 0;
exports.initMessage = initMessage;
const sequelize_1 = require("sequelize");
class Message extends sequelize_1.Model {
}
exports.Message = Message;
function initMessage(sequelize) {
    Message.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        conversationId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'conversation_id' },
        senderId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'sender_id' },
        text: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        image: { type: sequelize_1.DataTypes.STRING(500), allowNull: true },
        isRead: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: false, field: 'is_read' },
    }, { sequelize, tableName: 'messages', timestamps: true, underscored: true });
}
//# sourceMappingURL=Message.js.map