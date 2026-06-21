import { Model, Sequelize } from 'sequelize';
export declare class ProfileLike extends Model {
    id: number;
    userId: number;
    likedUserId: number;
    created_at: Date;
    updated_at: Date;
}
export declare function initProfileLike(sequelize: Sequelize): void;
//# sourceMappingURL=ProfileLike.d.ts.map