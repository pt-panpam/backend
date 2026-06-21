"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Call = void 0;
exports.initCall = initCall;
const sequelize_1 = require("sequelize");
class Call extends sequelize_1.Model {
}
exports.Call = Call;
function initCall(sequelize) {
    Call.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        conversationId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'conversation_id' },
        callerId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'caller_id' },
        calleeId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'callee_id' },
        callType: { type: sequelize_1.DataTypes.STRING(10), allowNull: false, field: 'call_type' },
        status: { type: sequelize_1.DataTypes.STRING(10), defaultValue: 'missed' },
        startedAt: { type: sequelize_1.DataTypes.DATE, allowNull: true, field: 'started_at' },
        endedAt: { type: sequelize_1.DataTypes.DATE, allowNull: true, field: 'ended_at' },
        duration: { type: sequelize_1.DataTypes.INTEGER, allowNull: true },
    }, { sequelize, tableName: 'calls', timestamps: true, underscored: true });
}
//# sourceMappingURL=Call.js.map