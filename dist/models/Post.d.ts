import { Model, Sequelize } from 'sequelize';
import { User } from './User';
import { PostPhoto } from './PostPhoto';
export declare class Post extends Model {
    id: number;
    userId: number;
    caption: string;
    location: string;
    latitude: number | null;
    longitude: number | null;
    isActive: boolean;
    expiresAt: Date;
    created_at: Date;
    updated_at: Date;
    user?: User;
    photos?: PostPhoto[];
}
export declare function initPost(sequelize: Sequelize): void;
//# sourceMappingURL=Post.d.ts.map