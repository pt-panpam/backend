import { DataTypes, Model, Sequelize } from 'sequelize';

export class SafeZone extends Model {
  declare id: number;
  declare userId: number;
  declare latitude: number;
  declare longitude: number;
  declare radiusKm: number;
  declare label: string;
  declare isActive: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initSafeZone(sequelize: Sequelize): void {
  SafeZone.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    latitude: { type: DataTypes.FLOAT, allowNull: false },
    longitude: { type: DataTypes.FLOAT, allowNull: false },
    radiusKm: { type: DataTypes.FLOAT, defaultValue: 5, field: 'radius_km' },
    label: { type: DataTypes.STRING, defaultValue: '' },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true, field: 'is_active' },
  }, { sequelize, tableName: 'safe_zones', timestamps: true, underscored: true });
}
