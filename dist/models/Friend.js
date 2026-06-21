"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Friend = void 0;
exports.initFriend = initFriend;
const sequelize_1 = require("sequelize");
class Friend extends sequelize_1.Model {
}
exports.Friend = Friend;
function initFriend(sequelize) {
    Friend.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user_id' },
        friendId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'friend_id' },
    }, { sequelize, tableName: 'friends', timestamps: true, underscored: true });
}
//# sourceMappingURL=Friend.js.map