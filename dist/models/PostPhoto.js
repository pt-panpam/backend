"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostPhoto = void 0;
exports.initPostPhoto = initPostPhoto;
const sequelize_1 = require("sequelize");
class PostPhoto extends sequelize_1.Model {
}
exports.PostPhoto = PostPhoto;
function initPostPhoto(sequelize) {
    PostPhoto.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        postId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'post_id' },
        image: { type: sequelize_1.DataTypes.STRING(500), allowNull: false },
        order: { type: sequelize_1.DataTypes.INTEGER, defaultValue: 0 },
    }, { sequelize, tableName: 'post_photos', timestamps: true, underscored: true });
}
//# sourceMappingURL=PostPhoto.js.map