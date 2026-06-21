import { Model, Sequelize } from 'sequelize';
export declare class ProfileGallery extends Model {
    id: number;
    userId: number;
    image: string;
    order: number;
    created_at: Date;
    updated_at: Date;
}
export declare function initProfileGallery(sequelize: Sequelize): void;
//# sourceMappingURL=ProfileGallery.d.ts.map