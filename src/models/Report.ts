import { DataTypes, Model, Sequelize } from 'sequelize';

export class Report extends Model {
  declare id: number;
  declare reporterId: number;
  declare reportedUserId: number;
  declare reason: string;
  declare conversationId: number | null;
  declare created_at: Date;
}

export function initReport(sequelize: Sequelize): void {
  Report.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    reporterId: { type: DataTypes.INTEGER, allowNull: false, field: 'reporter_id' },
    reportedUserId: { type: DataTypes.INTEGER, allowNull: false, field: 'reported_user_id' },
    reason: { type: DataTypes.TEXT, defaultValue: '' },
    conversationId: { type: DataTypes.INTEGER, allowNull: true, field: 'conversation_id' },
  }, { sequelize, tableName: 'reports', timestamps: true, underscored: true });
}
