import { Model, Sequelize } from 'sequelize';
export declare class CrossSettings extends Model {
    id: number;
    userId: number;
    reviewHour: number;
    reviewMinute: number;
    revealDelayMinutes: number;
    updated_at: Date;
    canChange(): boolean;
}
export declare function initCrossSettings(sequelize: Sequelize): void;
//# sourceMappingURL=CrossSettings.d.ts.map