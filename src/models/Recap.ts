import { DataTypes, Model, Sequelize } from 'sequelize';

export class Recap extends Model {
  declare id: number;
  declare userId: number;
  declare date: string;
  declare period: 'am' | 'pm';
  declare total: number;
  declare unlocked: number;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initRecap(sequelize: Sequelize): void {
  Recap.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    date: { type: DataTypes.STRING(10), allowNull: false },
    period: { type: DataTypes.STRING(2), allowNull: false },
    total: { type: DataTypes.INTEGER, defaultValue: 0 },
    unlocked: { type: DataTypes.INTEGER, defaultValue: 0 },
  }, { sequelize, tableName: 'recaps', timestamps: true, underscored: true });
}
