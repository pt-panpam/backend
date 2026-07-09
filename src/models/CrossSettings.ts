import { DataTypes, Model, Sequelize } from 'sequelize';

export class CrossSettings extends Model {
  declare id: number;
  declare userId: number;
  declare revealScheduleHour1: number;
  declare revealScheduleHour2: number;
  declare revealDelayMinutes: number;
  declare revealScheduleUpdatedAt: Date | null;

  canChangeRecapTiming(): boolean {
    if (!this.revealScheduleUpdatedAt) return true;
    const tenDays = 10 * 24 * 60 * 60 * 1000;
    return Date.now() - new Date(this.revealScheduleUpdatedAt).getTime() >= tenDays;
  }
}

export function initCrossSettings(sequelize: Sequelize): void {
  CrossSettings.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, unique: true, field: 'user_id' },
    revealScheduleHour1: { type: DataTypes.INTEGER, defaultValue: 9, field: 'reveal_schedule_hour_1' },
    revealScheduleHour2: { type: DataTypes.INTEGER, defaultValue: 21, field: 'reveal_schedule_hour_2' },
    revealDelayMinutes: { type: DataTypes.INTEGER, defaultValue: 30, field: 'reveal_delay_minutes' },
    revealScheduleUpdatedAt: { type: DataTypes.DATE, allowNull: true, field: 'reveal_schedule_updated_at' },
  }, { sequelize, tableName: 'cross_settings', timestamps: true, underscored: true });
}
