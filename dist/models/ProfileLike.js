"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileLike = void 0;
exports.initProfileLike = initProfileLike;
const sequelize_1 = require("sequelize");
class ProfileLike extends sequelize_1.Model {
}
exports.ProfileLike = ProfileLike;
function initProfileLike(sequelize) {
    ProfileLike.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user_id' },
        likedUserId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'liked_user_id' },
    }, { sequelize, tableName: 'profile_likes', timestamps: true, underscored: true });
}
//# sourceMappingURL=ProfileLike.js.map