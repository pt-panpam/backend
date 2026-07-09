import { DataTypes, Model, Sequelize } from 'sequelize';

export class CrossEvent extends Model {
  declare id: number;
  declare user1Id: number;
  declare user2Id: number;
  declare latitude: number;
  declare longitude: number;
  declare hexId: string;
  declare hexLatitude: number;
  declare hexLongitude: number;
  declare crossDateIst: string;
  declare userAUnlockTime: Date | null;
  declare userBUnlockTime: Date | null;
  declare lastSeenAt: Date | null;
  declare revealDelayMinutes: number;
  declare revealedAt: Date | null;
  declare crossedAt: Date;
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
    latitude: { type: DataTypes.FLOAT, allowNull: false },
    longitude: { type: DataTypes.FLOAT, allowNull: false },
    hexId: { type: DataTypes.STRING, field: 'hex_id' },
    hexLatitude: { type: DataTypes.FLOAT, field: 'hex_latitude' },
    hexLongitude: { type: DataTypes.FLOAT, field: 'hex_longitude' },
    crossDateIst: { type: DataTypes.STRING(10), field: 'cross_date_ist' },
    userAUnlockTime: { type: DataTypes.DATE, field: 'user_a_unlock_time' },
    userBUnlockTime: { type: DataTypes.DATE, field: 'user_b_unlock_time' },
    lastSeenAt: { type: DataTypes.DATE, field: 'last_seen_at' },
    revealDelayMinutes: { type: DataTypes.INTEGER, defaultValue: 0, field: 'reveal_delay_minutes' },
    revealedAt: { type: DataTypes.DATE, field: 'revealed_at' },
    crossedAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW, field: 'crossed_at' },
    published: { type: DataTypes.BOOLEAN, defaultValue: false },
    notified: { type: DataTypes.BOOLEAN, defaultValue: false },
  }, { sequelize, tableName: 'cross_events', timestamps: true, underscored: true });
}
