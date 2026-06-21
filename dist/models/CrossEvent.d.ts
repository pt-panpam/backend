import { Model, Sequelize } from 'sequelize';
export declare class CrossEvent extends Model {
    id: number;
    user1Id: number;
    user2Id: number;
    latitude: number;
    longitude: number;
    crossedAt: Date;
    published: boolean;
    created_at: Date;
    updated_at: Date;
}
export declare function initCrossEvent(sequelize: Sequelize): void;
//# sourceMappingURL=CrossEvent.d.ts.map