"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Block = void 0;
exports.initBlock = initBlock;
const sequelize_1 = require("sequelize");
class Block extends sequelize_1.Model {
}
exports.Block = Block;
function initBlock(sequelize) {
    Block.init({
        id: { type: sequelize_1.DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
        blockerId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'blocker_id' },
        blockedId: { type: sequelize_1.DataTypes.INTEGER, allowNull: false, field: 'blocked_id' },
    }, { sequelize, tableName: 'blocks', timestamps: true, underscored: true });
}
//# sourceMappingURL=Block.js.map