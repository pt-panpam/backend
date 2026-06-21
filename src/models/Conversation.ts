import { DataTypes, Model, Sequelize } from 'sequelize';
import { User } from './User';
import { Message } from './Message';

export class Conversation extends Model {
  declare id: number;
  declare created_at: Date;
  declare updated_at: Date;
  declare participants?: User[];
  declare messages?: Message[];
}

export function initConversation(sequelize: Sequelize): void {
  Conversation.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  }, { sequelize, tableName: 'conversations', timestamps: true, underscored: true });
}
