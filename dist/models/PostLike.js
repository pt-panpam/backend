"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostLike = void 0;
exports.initPostLike = initPostLike;
const sequelize_1 = require("sequelize");
class PostLike extends sequelize_1.Model {
}
exports.PostLike = PostLike;
function initPostLike(sequelize) {
    PostLike.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user_id' },
        postId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'post_id' },
        likeType: { type: sequelize_1.DataTypes.STRING(20), defaultValue: 'like', field: 'like_type' },
    }, { sequelize, tableName: 'post_likes', timestamps: true, underscored: true });
}
//# sourceMappingURL=PostLike.js.map