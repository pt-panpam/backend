export interface RoutePoint {
    userId: number;
    latitude: number;
    longitude: number;
    hexId: string;
    recordedAt: Date;
}
export interface CrossingRoute {
    user1Id: number;
    user2Id: number;
    hexId: string;
    lat1: number;
    lng1: number;
    lat2: number;
    lng2: number;
    crossedAt: Date;
}
export type RouteStorageStatus = 'connected' | 'disconnected' | 'error';
export declare class RouteService {
    private static instance;
    private pool;
    private status;
    private constructor();
    static getInstance(): RouteService;
    connect(): Promise<boolean>;
    private createTables;
    isAvailable(): boolean;
    getStatus(): RouteStorageStatus;
    insertRoutePoint(point: RoutePoint): Promise<void>;
    insertCrossingRoute(crossing: CrossingRoute): Promise<void>;
    getUserRoute(userId: number, since?: Date): Promise<RoutePoint[]>;
    getCrossingRouteHistory(userId: number, limit?: number): Promise<CrossingRoute[]>;
    getHexAtTime(userId: number, timestamp: Date): Promise<string | null>;
    disconnect(): Promise<void>;
    cleanupOldRoutes(): Promise<void>;
}
//# sourceMappingURL=RouteService.d.ts.map