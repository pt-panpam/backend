import { Model, Sequelize } from 'sequelize';
export declare class Friend extends Model {
    id: number;
    userId: number;
    friendId: number;
    created_at: Date;
    updated_at: Date;
}
export declare function initFriend(sequelize: Sequelize): void;
//# sourceMappingURL=Friend.d.ts.map