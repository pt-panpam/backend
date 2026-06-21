"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Hobby = void 0;
exports.initHobby = initHobby;
const sequelize_1 = require("sequelize");
class Hobby extends sequelize_1.Model {
}
exports.Hobby = Hobby;
function initHobby(sequelize) {
    Hobby.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        name: { type: sequelize_1.DataTypes.STRING(100), allowNull: false, unique: true },
    }, { sequelize, tableName: 'hobbies', timestamps: true, underscored: true });
}
//# sourceMappingURL=Hobby.js.map