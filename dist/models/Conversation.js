"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Conversation = void 0;
exports.initConversation = initConversation;
const sequelize_1 = require("sequelize");
class Conversation extends sequelize_1.Model {
}
exports.Conversation = Conversation;
function initConversation(sequelize) {
    Conversation.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    }, { sequelize, tableName: 'conversations', timestamps: true, underscored: true });
}
//# sourceMappingURL=Conversation.js.map