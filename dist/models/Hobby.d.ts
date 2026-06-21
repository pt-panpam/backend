import { Model, Sequelize } from 'sequelize';
export declare class Hobby extends Model {
    id: number;
    name: string;
    created_at: Date;
    updated_at: Date;
}
export declare function initHobby(sequelize: Sequelize): void;
//# sourceMappingURL=Hobby.d.ts.map