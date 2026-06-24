import { DataTypes, Model, Sequelize } from 'sequelize';
import { Post } from './Post';

export class Message extends Model {
  declare id: number;
  declare conversationId: number;
  declare senderId: number;
  declare text: string;
  declare image: string | null;
  declare audio: string | null;
  declare replyToId: number | null;
  declare postId: number | null;
  declare isRead: boolean;
  declare created_at: Date;
  declare updated_at: Date;
  declare replyTo?: Message;
  declare post?: Post;
}

export function initMessage(sequelize: Sequelize): void {
  Message.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    conversationId: { type: DataTypes.INTEGER, allowNull: false, field: 'conversation_id' },
    senderId: { type: DataTypes.INTEGER, allowNull: false, field: 'sender_id' },
    text: { type: DataTypes.TEXT, defaultValue: '' },
    image: { type: DataTypes.STRING(500), allowNull: true },
    audio: { type: DataTypes.STRING(500), allowNull: true },
    replyToId: { type: DataTypes.INTEGER, allowNull: true, field: 'reply_to_id' },
    postId: { type: DataTypes.INTEGER, allowNull: true, field: 'post_id' },
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_read' },
  }, { sequelize, tableName: 'messages', timestamps: true, underscored: true });
}
