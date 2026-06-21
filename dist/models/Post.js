"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Post = void 0;
exports.initPost = initPost;
const sequelize_1 = require("sequelize");
class Post extends sequelize_1.Model {
}
exports.Post = Post;
function initPost(sequelize) {
    Post.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user_id' },
        caption: { type: sequelize_1.DataTypes.TEXT, defaultValue: '' },
        location: { type: sequelize_1.DataTypes.STRING(255), defaultValue: '' },
        latitude: { type: sequelize_1.DataTypes.FLOAT, allowNull: true },
        longitude: { type: sequelize_1.DataTypes.FLOAT, allowNull: true },
        isActive: { type: sequelize_1.DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
        expiresAt: { type: sequelize_1.DataTypes.DATE, field: 'expires_at' },
    }, { sequelize, tableName: 'posts', timestamps: true, underscored: true });
}
//# sourceMappingURL=Post.js.map