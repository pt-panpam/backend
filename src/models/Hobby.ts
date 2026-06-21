import { DataTypes, Model, Sequelize } from 'sequelize';

export class Hobby extends Model {
  declare id: number;
  declare name: string;
  declare created_at: Date;
  declare updated_at: Date;
}

export function initHobby(sequelize: Sequelize): void {
  Hobby.init({
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  }, { sequelize, tableName: 'hobbies', timestamps: true, underscored: true });
}
