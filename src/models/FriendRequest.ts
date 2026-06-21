import { DataTypes, Model, Sequelize } from 'sequelize';
import { User } from './User';

export class FriendRequest extends Model {
  declare id: number;
  declare fromUserId: number;
  declare toUserId: number;
  declare status: 'pending' | 'accepted' | 'rejected';
  declare created_at: Date;
  declare updated_at: Date;
  declare fromUser?: User;
  declare toUser?: User;
}

export function initFriendRequest(sequelize: Sequelize): void {
  FriendRequest.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    fromUserId: { type: DataTypes.INTEGER, allowNull: false, field: 'from_user_id' },
    toUserId: { type: DataTypes.INTEGER, allowNull: false, field: 'to_user_id' },
    status: { type: DataTypes.STRING(20), defaultValue: 'pending' },
  }, { sequelize, tableName: 'friend_requests', timestamps: true, underscored: true });
}
