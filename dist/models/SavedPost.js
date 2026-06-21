"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SavedPost = void 0;
exports.initSavedPost = initSavedPost;
const sequelize_1 = require("sequelize");
class SavedPost extends sequelize_1.Model {
}
exports.SavedPost = SavedPost;
function initSavedPost(sequelize) {
    SavedPost.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user_id' },
        postId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'post_id' },
    }, { sequelize, tableName: 'saved_posts', timestamps: true, underscored: true });
}
//# sourceMappingURL=SavedPost.js.map