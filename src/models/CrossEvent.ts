import { DataTypes, Model, Sequelize } from 'sequelize';

export class CrossEvent extends Model {
  declare id: number;
  declare user1Id: number;
  declare user2Id: number;
  declare hexId: string; // ONLY the H3 Resolution 9 Cell ID is stored
  declare crossDateIst: string;
  declare crossedAt: Date;
  declare revealTimeA: Date;
  declare revealTimeB: Date;
  declare notificationTime: Date; // max(RevealTimeA, RevealTimeB)
  declare recapSlotTime: Date; // The exact 9AM/9PM unlock time
  declare published: boolean;
  declare notified: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initCrossEvent(sequelize: Sequelize): void {
  CrossEvent.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    user1Id: { type: DataTypes.INTEGER, allowNull: false, field: 'user1_id' },
    user2Id: { type: DataTypes.INTEGER, allowNull: false, field: 'user2_id' },
    hexId: { type: DataTypes.STRING, allowNull: false, field: 'hex_id' },
    crossDateIst: { type: DataTypes.STRING(10), allowNull: false, field: 'cross_date_ist' },
    crossedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'crossed_at' },
    revealTimeA: { type: DataTypes.DATE, allowNull: false, field: 'reveal_time_a' },
    revealTimeB: { type: DataTypes.DATE, allowNull: false, field: 'reveal_time_b' },
    notificationTime: { type: DataTypes.DATE, allowNull: false, field: 'notification_time' },
    recapSlotTime: { type: DataTypes.DATE, allowNull: false, field: 'recap_slot_time' },
    published: { type: DataTypes.BOOLEAN, defaultValue: false },
    notified: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, { 
    sequelize, 
    tableName: 'cross_events', 
    timestamps: true, 
    underscored: true,
    indexes: [
      { unique: true, fields: ['user1_id', 'user2_id', 'cross_date_ist'] },
      { fields: ['notification_time'], where: { notified: false } },
    ],
  });
}