import { Model, Sequelize } from 'sequelize';
import { User } from './User';
export declare class FriendRequest extends Model {
    id: number;
    fromUserId: number;
    toUserId: number;
    status: 'pending' | 'accepted' | 'rejected';
    created_at: Date;
    updated_at: Date;
    fromUser?: User;
    toUser?: User;
}
export declare function initFriendRequest(sequelize: Sequelize): void;
//# sourceMappingURL=FriendRequest.d.ts.map