"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.H3Service = void 0;
const h3_js_1 = require("h3-js");
const env_1 = require("../../config/env");
const RESOLUTION = env_1.env.H3_RESOLUTION;
class H3Service {
    static latLngToHex(lat, lng) {
        return (0, h3_js_1.latLngToCell)(lat, lng, RESOLUTION);
    }
    static hexToBoundary(hex) {
        return (0, h3_js_1.cellToBoundary)(hex);
    }
    static hexToCenter(hex) {
        const [lat, lng] = (0, h3_js_1.cellToLatLng)(hex);
        return { lat, lng };
    }
    static getNeighborHexes(hex, radius = 1) {
        return (0, h3_js_1.gridDisk)(hex, radius);
    }
    static areInSameHex(lat1, lng1, lat2, lng2) {
        return this.latLngToHex(lat1, lng1) === this.latLngToHex(lat2, lng2);
    }
}
exports.H3Service = H3Service;
//# sourceMappingURL=H3Service.js.map