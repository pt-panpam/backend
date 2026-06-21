import { DataTypes, Model, Sequelize } from 'sequelize';

export class ConversationReadStatus extends Model {
  declare id: number;
  declare conversationId: number;
  declare userId: number;
  declare lastReadMessageId: number | null;
}

export function initConversationReadStatus(sequelize: Sequelize): void {
  ConversationReadStatus.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    conversationId: { type: DataTypes.INTEGER, allowNull: false, field: 'conversation_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    lastReadMessageId: { type: DataTypes.INTEGER, allowNull: true, field: 'last_read_message_id' },
  }, { sequelize, tableName: 'conversation_read_statuses', timestamps: true, underscored: true });
}
