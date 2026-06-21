import { Model, Sequelize } from 'sequelize';
import { User } from './User';
export declare class Notification extends Model {
    id: number;
    userId: number;
    type: 'friend_request' | 'friend_accepted' | 'post_like' | 'post_comment' | 'new_message' | 'cross_event';
    title: string;
    body: string;
    actorId: number | null;
    postId: number | null;
    isRead: boolean;
    created_at: Date;
    updated_at: Date;
    actor?: User;
}
export declare function initNotification(sequelize: Sequelize): void;
//# sourceMappingURL=Notification.d.ts.map