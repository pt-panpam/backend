"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Comment = void 0;
exports.initComment = initComment;
const sequelize_1 = require("sequelize");
class Comment extends sequelize_1.Model {
}
exports.Comment = Comment;
function initComment(sequelize) {
    Comment.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        postId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'post_id' },
        userId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user_id' },
        text: { type: sequelize_1.DataTypes.TEXT, allowNull: false },
    }, { sequelize, tableName: 'comments', timestamps: true, underscored: true });
}
//# sourceMappingURL=Comment.js.map