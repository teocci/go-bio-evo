/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-7월-04
 */

export default class Grid {
    static EMPTY = 0 // Index value 0 is reserved
    static BARRIER = 0xffff

    constructor(n, m) {
        this.data = []

        this.barrierLocations = []
        this.barrierCenters = []

        this.init(n, m)
    }

    get sizeX() {
        return this.n
    }

    get sizeY() {
        return this.m
    }

    set sizeX(n) {
        this.n = n
    }

    set sizeY(m) {
        this.m = m
    }

    init(n, m) {
        this.sizeX = n ?? null
        this.sizeY = m ?? null

        if (this.sizeX != null && this.sizeY != null) {
            this.data = [...Array(this.sizeY)].map(() => [...Array(this.sizeX)].fill(Grid.EMPTY))
        }
    }

    findEmptyLocation() {
        const coord = new Coord()

        while (true) {
            coord.x = randomUint(this.sizeX)
            coord.y = randomUint(this.sizeY)
            if (this.isEmptyAt(coord)) break
        }

        return coord
    }

    // This is a utility function used when inspecting a local neighborhood around
    // some location. This function feeds each valid (in-bounds) location in the specified
    // neighborhood to the specified function. Locations include self (center of the neighborhood).
    visitNeighborhood(loc, radius, f) {
        for (let dx = -Math.min(radius, loc.x); dx <= Math.min(radius, this.sizeX - loc.x - 1); ++dx) {
            const x = loc.x + dx
            if (!(x >= 0 && x < this.sizeX)) continue

            let extentY = Math.sqrt(radius * radius - dx * dx)
            for (let dy = -Math.min(extentY, loc.y); dy <= Math.min(extentY, this.sizeY - loc.y - 1); ++dy) {
                const y = loc.y + dy;
                if (!(y >= 0 && y < this.sizeY)) continue

                f(new Coord({x, y}))
            }
        }
    }

    isInBounds(loc) {
        return loc.x >= 0 && loc.x < this.sizeX && loc.y >= 0 && loc.y < this.sizeY
    }

    isEmptyAt(point) {
        return this.data[point.x][point.y] === Grid.EMPTY
    }

    isBarrierAt(loc) {
        return this.at(loc) === Grid.BARRIER
    }

    // Occupied means an agent is living there.
    isOccupiedAt(loc) {
        return this.at(loc) !== Grid.EMPTY && this.at(loc) !== Grid.BARRIER
    }

    isBorder(loc) {
        return loc.x === 0 || loc.x === this.sizeX - 1 || loc.y === 0 || loc.y === this.sizeY - 1;
    }

    at(loc) {
        return this.data[loc.x][loc.y]
    }

    atXY(x, y) {
        return this.data[x][y]
    }

    set(loc, val) {
        this.data[loc.x][loc.y] = val
    }

    setXY(x, y, val) {
        this.data[x][y] = val
    }

    row(r) {
        return this.data[r]
    }

    column(c) {
        return this.data.map(d => d[c])
    }

    toString() {
        return JSON.stringify(this.data)
            .replace(/(\[\[)(.*)(]])/g, '[\n  [$2]\n]')
            .replace(/],/g, '],\n  ')
    }
}