import { DataTypes, Model, Sequelize } from 'sequelize';

export class Comment extends Model {
  declare id: number;
  declare postId: number;
  declare userId: number;
  declare text: string;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initComment(sequelize: Sequelize): void {
  Comment.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    postId: { type: DataTypes.INTEGER, allowNull: false, field: 'post_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    text: { type: DataTypes.TEXT, allowNull: false },
  }, { sequelize, tableName: 'comments', timestamps: true, underscored: true });
}
