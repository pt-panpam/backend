import { DataTypes, Model, Sequelize } from 'sequelize';

export class Friend extends Model {
  declare id: number;
  declare userId: number;
  declare friendId: number;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initFriend(sequelize: Sequelize): void {
  Friend.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    friendId: { type: DataTypes.INTEGER, allowNull: false, field: 'friend_id' },
  }, { sequelize, tableName: 'friends', timestamps: true, underscored: true });
}
