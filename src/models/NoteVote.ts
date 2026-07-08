import { DataTypes, Model, Sequelize } from 'sequelize';

export class NoteVote extends Model {
  declare id: number;
  declare noteId: number;
  declare userId: number;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initNoteVote(sequelize: Sequelize): void {
  NoteVote.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    noteId: { type: DataTypes.INTEGER, allowNull: false, field: 'note_id' },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
  }, { sequelize, tableName: 'note_votes', timestamps: true, underscored: true });
}
