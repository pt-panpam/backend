import { Model, Sequelize } from 'sequelize';
export declare class PostPhoto extends Model {
    id: number;
    postId: number;
    image: string;
    order: number;
    created_at: Date;
    updated_at: Date;
}
export declare function initPostPhoto(sequelize: Sequelize): void;
//# sourceMappingURL=PostPhoto.d.ts.map