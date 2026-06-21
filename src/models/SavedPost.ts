import { DataTypes, Model, Sequelize } from 'sequelize';

export class SavedPost extends Model {
  declare id: number;
  declare userId: number;
  declare postId: number;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initSavedPost(sequelize: Sequelize): void {
  SavedPost.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    postId: { type: DataTypes.INTEGER, allowNull: false, field: 'post_id' },
  }, { sequelize, tableName: 'saved_posts', timestamps: true, underscored: true });
}
