import { Model, Sequelize } from 'sequelize';
import { User } from './User';
export declare class Call extends Model {
    id: number;
    conversationId: number;
    callerId: number;
    calleeId: number;
    callType: 'audio' | 'video';
    status: 'missed' | 'answered' | 'rejected';
    startedAt: Date | null;
    endedAt: Date | null;
    duration: number | null;
    created_at: Date;
    updated_at: Date;
    caller?: User;
    callee?: User;
}
export declare function initCall(sequelize: Sequelize): void;
//# sourceMappingURL=Call.d.ts.map