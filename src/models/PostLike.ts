import { DataTypes, Model, Sequelize } from 'sequelize';

export class PostLike extends Model {
  declare id: number;
  declare userId: number;
  declare postId: number;
  declare likeType: 'like' | 'super_like' | 'dislike';
  declare created_at: Date;
  declare updated_at: Date;
}

export function initPostLike(sequelize: Sequelize): void {
  PostLike.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    postId: { type: DataTypes.INTEGER, allowNull: false, field: 'post_id' },
    likeType: { type: DataTypes.STRING(20), defaultValue: 'like', field: 'like_type' },
  }, { sequelize, tableName: 'post_likes', timestamps: true, underscored: true });
}
