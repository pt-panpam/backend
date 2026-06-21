import { Model, Sequelize } from 'sequelize';
import { User } from './User';
export declare class Block extends Model {
    id: number;
    blockerId: number;
    blockedId: number;
    created_at: Date;
    updated_at: Date;
    blocked?: User;
    blocker?: User;
}
export declare function initBlock(sequelize: Sequelize): void;
//# sourceMappingURL=Block.d.ts.map