import { Model, Sequelize } from 'sequelize';
export declare class ConversationReadStatus extends Model {
    id: number;
    conversationId: number;
    userId: number;
    lastReadMessageId: number | null;
}
export declare function initConversationReadStatus(sequelize: Sequelize): void;
//# sourceMappingURL=ConversationReadStatus.d.ts.map