import { Model, Sequelize } from 'sequelize';
export declare class Message extends Model {
    id: number;
    conversationId: number;
    senderId: number;
    text: string;
    image: string | null;
    isRead: boolean;
    created_at: Date;
    updated_at: Date;
}
export declare function initMessage(sequelize: Sequelize): void;
//# sourceMappingURL=Message.d.ts.map