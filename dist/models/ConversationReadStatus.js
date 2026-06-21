"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConversationReadStatus = void 0;
exports.initConversationReadStatus = initConversationReadStatus;
const sequelize_1 = require("sequelize");
class ConversationReadStatus extends sequelize_1.Model {
}
exports.ConversationReadStatus = ConversationReadStatus;
function initConversationReadStatus(sequelize) {
    ConversationReadStatus.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        conversationId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'conversation_id' },
        userId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user_id' },
        lastReadMessageId: { type: sequelize_1.DataTypes.INTEGER, allowNull: true, field: 'last_read_message_id' },
    }, { sequelize, tableName: 'conversation_read_statuses', timestamps: true, underscored: true });
}
//# sourceMappingURL=ConversationReadStatus.js.map