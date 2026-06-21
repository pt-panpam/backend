import { Model, Sequelize } from 'sequelize';
export declare class Comment extends Model {
    id: number;
    postId: number;
    userId: number;
    text: string;
    created_at: Date;
    updated_at: Date;
}
export declare function initComment(sequelize: Sequelize): void;
//# sourceMappingURL=Comment.d.ts.map