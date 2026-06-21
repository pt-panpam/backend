import { DataTypes, Model, Sequelize } from 'sequelize';
import { User } from './User';

export class Notification extends Model {
  declare id: number;
  declare userId: number;
  declare type: 'friend_request' | 'friend_accepted' | 'post_like' | 'post_comment' | 'new_message' | 'cross_event';
  declare title: string;
  declare body: string;
  declare actorId: number | null;
  declare postId: number | null;
  declare isRead: boolean;
  declare created_at: Date;
  declare updated_at: Date;
  declare actor?: User;
}

export function initNotification(sequelize: Sequelize): void {
  Notification.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    type: { type: DataTypes.STRING(30), allowNull: false },
    title: { type: DataTypes.STRING(255), allowNull: false },
    body: { type: DataTypes.TEXT, defaultValue: '' },
    actorId: { type: DataTypes.INTEGER, allowNull: true, field: 'actor_id' },
    postId: { type: DataTypes.INTEGER, allowNull: true, field: 'post_id' },
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_read' },
  }, { sequelize, tableName: 'notifications', timestamps: true, underscored: true });
}
