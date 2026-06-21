import { Model, Sequelize } from 'sequelize';
export declare class PostLike extends Model {
    id: number;
    userId: number;
    postId: number;
    likeType: 'like' | 'super_like' | 'dislike';
    created_at: Date;
    updated_at: Date;
}
export declare function initPostLike(sequelize: Sequelize): void;
//# sourceMappingURL=PostLike.d.ts.map