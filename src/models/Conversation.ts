import { DataTypes, Model, Sequelize } from 'sequelize';
import { User } from './User';
import { Message } from './Message';

export class Conversation extends Model {
  declare id: number;
  declare disappearingMinutes: number;
  declare isRequest: boolean;
  declare created_at: Date;
  declare updated_at: Date;
  declare participants?: User[];
  declare messages?: Message[];
}

export function initConversation(sequelize: Sequelize): void {
  Conversation.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    disappearingMinutes: { type: DataTypes.INTEGER, defaultValue: 0, field: 'disappearing_minutes' },
    isRequest: { type: DataTypes.BOOLEAN, defaultValue: false, field: 'is_request' },
  }, { sequelize, tableName: 'conversations', timestamps: true, underscored: true });
}
