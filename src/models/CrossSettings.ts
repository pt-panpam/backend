import { DataTypes, Model, Sequelize } from 'sequelize';

export class CrossSettings extends Model {
  declare id: number;
  declare userId: number;
  declare reviewHour: number;
  declare reviewMinute: number;
  declare revealDelayMinutes: number;
  declare updated_at: Date;

  canChange(): boolean {
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    return Date.now() - new Date(this.updated_at).getTime() >= tenDays;
  }
}

export function initCrossSettings(sequelize: Sequelize): void {
  CrossSettings.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'user_id' },
    reviewHour: { type: DataTypes.INTEGER, defaultValue: 21, field: 'review_hour' },
    reviewMinute: { type: DataTypes.INTEGER, defaultValue: 0, field: 'review_minute' },
    revealDelayMinutes: { type: DataTypes.INTEGER, defaultValue: 60, field: 'reveal_delay_minutes' },
  }, { sequelize, tableName: 'cross_settings', timestamps: true, underscored: true });
}
