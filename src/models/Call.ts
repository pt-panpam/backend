import { DataTypes, Model, Sequelize } from 'sequelize';
import { User } from './User';

export class Call extends Model {
  declare id: number;
  declare conversationId: number;
  declare callerId: number;
  declare calleeId: number;
  declare callType: 'audio' | 'video';
  declare status: 'missed' | 'answered' | 'rejected';
  declare startedAt: Date | null;
  declare endedAt: Date | null;
  declare duration: number | null;
  declare created_at: Date;
  declare updated_at: Date;
  declare caller?: User;
  declare callee?: User;
}

export function initCall(sequelize: Sequelize): void {
  Call.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    conversationId: { type: DataTypes.INTEGER, allowNull: false, field: 'conversation_id' },
    callerId: { type: DataTypes.INTEGER, allowNull: false, field: 'caller_id' },
    calleeId: { type: DataTypes.INTEGER, allowNull: false, field: 'callee_id' },
    callType: { type: DataTypes.STRING(10), allowNull: false, field: 'call_type' },
    status: { type: DataTypes.STRING(10), defaultValue: 'missed' },
    startedAt: { type: DataTypes.DATE, allowNull: true, field: 'started_at' },
    endedAt: { type: DataTypes.DATE, allowNull: true, field: 'ended_at' },
    duration: { type: DataTypes.INTEGER, allowNull: true },
  }, { sequelize, tableName: 'calls', timestamps: true, underscored: true });
}
