import { Server as SocketIOServer } from 'socket.io';
type CrossingCallback = (event: {
    user1Id: number;
    user2Id: number;
    hexId: string;
    lat: number;
    lng: number;
    timestamp: Date;
}) => void;
export declare class CrossingService {
    private static instance;
    private io;
    private onCrossingCallbacks;
    private constructor();
    static getInstance(): CrossingService;
    setIO(io: SocketIOServer): void;
    onCrossing(callback: CrossingCallback): void;
    updateLocation(userId: number, latitude: number, longitude: number): Promise<{
        crossingDetected: boolean;
        crossedWith: number[];
        hexId: string;
    }>;
    getRecentCrosses(userId: number, limit?: number): Promise<any[]>;
    getUserRoute(userId: number): Promise<any[]>;
    getDashboardStats(userId: number): Promise<{
        totalCrosses: number;
        uniqueCrosses: number;
        todayCrosses: number;
        currentHex: string | null;
    }>;
}
export {};
//# sourceMappingURL=CrossingService.d.ts.map