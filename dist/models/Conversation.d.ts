import { Model, Sequelize } from 'sequelize';
import { User } from './User';
import { Message } from './Message';
export declare class Conversation extends Model {
    id: number;
    created_at: Date;
    updated_at: Date;
    participants?: User[];
    messages?: Message[];
}
export declare function initConversation(sequelize: Sequelize): void;
//# sourceMappingURL=Conversation.d.ts.map