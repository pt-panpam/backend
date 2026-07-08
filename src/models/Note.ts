import { DataTypes, Model, Sequelize } from 'sequelize';

export class Note extends Model {
  declare id: number;
  declare userId: number;
  declare text: string;
  declare latitude: number;
  declare longitude: number;
  declare discoveryRadiusM: number;
  declare publishedAt: Date | null;
  declare upvoteCount: number;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initNote(sequelize: Sequelize): void {
  Note.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false, field: 'user_id' },
    text: { type: DataTypes.TEXT, allowNull: false },
    latitude: { type: DataTypes.FLOAT, allowNull: false },
    longitude: { type: DataTypes.FLOAT, allowNull: false },
    discoveryRadiusM: { type: DataTypes.FLOAT, defaultValue: 50, field: 'discovery_radius_m' },
    publishedAt: { type: DataTypes.DATE, allowNull: true, field: 'published_at' },
    upvoteCount: { type: DataTypes.INTEGER, defaultValue: 0, field: 'upvote_count' },
  }, { sequelize, tableName: 'notes', timestamps: true, underscored: true });
}
