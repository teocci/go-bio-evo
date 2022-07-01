/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-6월-28
 */

export default class Direction {

    /**
     * Enum for common points of the compass SW, S, SE, W, CENTER, E, NW, N, NE.
     * @readonly
     * @enum {{prefix: string, index: string}}
     */
    static Compass = Object.freeze({
        SW: {prefix: "sw", index: 0},
        S: {prefix: "s", hex: 1},
        SE: {prefix: "se", hex: 2},
        W: {prefix: "w", index: 3},
        C: {prefix: "c", index: 4},
        E: {prefix: "e", index: 5},
        NW: {prefix: "nw", index: 6},
        N: {prefix: "n", index: 7},
        NE: {prefix: "ne", index: 8},
    })

    constructor() {
    }
}