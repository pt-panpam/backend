export type RedisStatus = 'connected' | 'disconnected' | 'error';
export declare class RedisService {
    private static instance;
    private client;
    private subscriber;
    private status;
    private pubSubCallbacks;
    private constructor();
    static getInstance(): RedisService;
    connect(): Promise<boolean>;
    getStatus(): RedisStatus;
    isAvailable(): boolean;
    setUserLocation(userId: number, hexId: string): Promise<void>;
    getHexOccupants(hexId: string, excludeUserId?: number): Promise<number[]>;
    getUserHex(userId: number): Promise<string | null>;
    getUsersInHexes(hexIds: string[], excludeUserId?: number): Promise<Map<string, number[]>>;
    publishCrossEvent(user1Id: number, user2Id: number, hexId: string, lat: number, lng: number): Promise<void>;
    subscribe(channel: string, callback: (message: string, channel: string) => void): void;
    disconnect(): Promise<void>;
}
//# sourceMappingURL=RedisService.d.ts.map