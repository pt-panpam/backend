import { DataTypes, Model, Sequelize } from 'sequelize';
import { User } from './User';

export class Block extends Model {
  declare id: number;
  declare blockerId: number;
  declare blockedId: number;
  declare created_at: Date;
  declare updated_at: Date;
  declare blocked?: User;
  declare blocker?: User;
}

export function initBlock(sequelize: Sequelize): void {
  Block.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    blockerId: { type: DataTypes.INTEGER, allowNull: false, field: 'blocker_id' },
    blockedId: { type: DataTypes.INTEGER, allowNull: false, field: 'blocked_id' },
  }, { sequelize, tableName: 'blocks', timestamps: true, underscored: true });
}
