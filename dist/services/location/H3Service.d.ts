export declare class H3Service {
    static latLngToHex(lat: number, lng: number): string;
    static hexToBoundary(hex: string): [number, number][];
    static hexToCenter(hex: string): {
        lat: number;
        lng: number;
    };
    static getNeighborHexes(hex: string, radius?: number): string[];
    static areInSameHex(lat1: number, lng1: number, lat2: number, lng2: number): boolean;
}
//# sourceMappingURL=H3Service.d.ts.map