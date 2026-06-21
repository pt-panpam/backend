import { DataTypes, Model, Sequelize } from 'sequelize';

export class ProfileLike extends Model {
  declare id: number;
  declare userId: number;
  declare likedUserId: number;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initProfileLike(sequelize: Sequelize): void {
  ProfileLike.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    likedUserId: { type: DataTypes.INTEGER, allowNull: false, field: 'liked_user_id' },
  }, { sequelize, tableName: 'profile_likes', timestamps: true, underscored: true });
}
