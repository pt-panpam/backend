import { DataTypes, Model, Sequelize } from 'sequelize';

export class ProfileGallery extends Model {
  declare id: number;
  declare userId: number;
  declare image: string;
  declare order: number;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initProfileGallery(sequelize: Sequelize): void {
  ProfileGallery.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    image: { type: DataTypes.STRING(500), allowNull: false },
    order: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { sequelize, tableName: 'profile_galleries', timestamps: true, underscored: true });
}
