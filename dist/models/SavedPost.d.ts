import { Model, Sequelize } from 'sequelize';
export declare class SavedPost extends Model {
    id: number;
    userId: number;
    postId: number;
    created_at: Date;
    updated_at: Date;
}
export declare function initSavedPost(sequelize: Sequelize): void;
//# sourceMappingURL=SavedPost.d.ts.map