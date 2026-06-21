"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FriendRequest = void 0;
exports.initFriendRequest = initFriendRequest;
const sequelize_1 = require("sequelize");
class FriendRequest extends sequelize_1.Model {
}
exports.FriendRequest = FriendRequest;
function initFriendRequest(sequelize) {
    FriendRequest.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        fromUserId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'from_user_id' },
        toUserId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'to_user_id' },
        status: { type: sequelize_1.DataTypes.STRING(20), defaultValue: 'pending' },
    }, { sequelize, tableName: 'friend_requests', timestamps: true, underscored: true });
}
//# sourceMappingURL=FriendRequest.js.map