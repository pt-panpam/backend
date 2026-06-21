import { DataTypes, Model, Sequelize } from 'sequelize';

export class Message extends Model {
  declare id: number;
  declare conversationId: number;
  declare senderId: number;
  declare text: string;
  declare image: string | null;
  declare isRead: boolean;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initMessage(sequelize: Sequelize): void {
  Message.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    conversationId: { type: DataTypes.INTEGER, allowNull: false, field: 'conversation_id' },
    senderId: { type: DataTypes.INTEGER, allowNull: false, field: 'sender_id' },
    text: { type: DataTypes.TEXT, defaultValue: '' },
    image: { type: DataTypes.STRING(500), allowNull: true },
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_read' },
  }, { sequelize, tableName: 'messages', timestamps: true, underscored: true });
}
