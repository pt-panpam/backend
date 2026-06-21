"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProfileGallery = void 0;
exports.initProfileGallery = initProfileGallery;
const sequelize_1 = require("sequelize");
class ProfileGallery extends sequelize_1.Model {
}
exports.ProfileGallery = ProfileGallery;
function initProfileGallery(sequelize) {
    ProfileGallery.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        userId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'user_id' },
        image: { type: sequelize_1.DataTypes.STRING(500), allowNull: false },
        order: { type: sequelize_1.DataTypes.INTEGER, defaultValue: 0 },
    }, { sequelize, tableName: 'profile_galleries', timestamps: true, underscored: true });
}
//# sourceMappingURL=ProfileGallery.js.map