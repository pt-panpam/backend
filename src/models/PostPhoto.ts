import { DataTypes, Model, Sequelize } from 'sequelize';

export class PostPhoto extends Model {
  declare id: number;
  declare postId: number;
  declare image: string;
  declare type: string;
  declare order: number;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initPostPhoto(sequelize: Sequelize): void {
  PostPhoto.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    postId: { type: DataTypes.INTEGER, allowNull: false, field: 'post_id' },
    image: { type: DataTypes.STRING(500), allowNull: false },
    type: { type: DataTypes.STRING(10), defaultValue: 'photo' },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { sequelize, tableName: 'post_photos', timestamps: true, underscored: true });
}
