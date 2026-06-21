import { DataTypes, Model, Sequelize } from 'sequelize';
import { User } from './User';
import { PostPhoto } from './PostPhoto';

export class Post extends Model {
  declare id: number;
  declare userId: number;
  declare caption: string;
  declare location: string;
  declare latitude: number | null;
  declare longitude: number | null;
  declare isActive: boolean;
  declare expiresAt: Date;
  declare created_at: Date;
  declare updated_at: Date;
  declare user?: User;
  declare photos?: PostPhoto[];
}

export function initPost(sequelize: Sequelize): void {
  Post.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    caption: { type: DataTypes.TEXT, defaultValue: '' },
    location: { type: DataTypes.STRING(255), defaultValue: '' },
    latitude: { type: DataTypes.FLOAT, allowNull: true },
    longitude: { type: DataTypes.FLOAT, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
    expiresAt: { type: DataTypes.DATE, field: 'expires_at' },
  }, { sequelize, tableName: 'posts', timestamps: true, underscored: true });
}
