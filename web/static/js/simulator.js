/**
 * Created by RTT.
 * Author: teocci@yandex.com on 2022-6월-28
 */

export default class Simulator {
    static CHALLENGE_CIRCLE = 0
    static CHALLENGE_RIGHT_HALF = 1
    static CHALLENGE_RIGHT_QUARTER = 2
    static CHALLENGE_STRING = 3
    static CHALLENGE_CENTER_WEIGHTED = 4
    static CHALLENGE_CENTER_UNWEIGHTED = 40
    static CHALLENGE_CORNER = 5
    static CHALLENGE_CORNER_WEIGHTED = 6
    static CHALLENGE_MIGRATE_DISTANCE = 7
    static CHALLENGE_CENTER_SPARSE = 8
    static CHALLENGE_LEFT_EIGHTH = 9
    static CHALLENGE_RADIOACTIVE_WALLS = 10
    static CHALLENGE_AGAINST_ANY_WALL = 11
    static CHALLENGE_TOUCH_ANY_WALL = 12
    static CHALLENGE_EAST_WEST_EIGHTHS = 13
    static CHALLENGE_NEAR_BARRIER = 14
    static CHALLENGE_PAIRS = 15
    static CHALLENGE_LOCATION_SEQUENCE = 16
    static CHALLENGE_ALTRUISM = 17
    static CHALLENGE_ALTRUISM_SACRIFICE = 18

    static CHALLENGES = [
        Simulator.CHALLENGE_CIRCLE,
        Simulator.CHALLENGE_RIGHT_HALF,
        Simulator.CHALLENGE_RIGHT_QUARTER,
        Simulator.CHALLENGE_STRING,
        Simulator.CHALLENGE_CENTER_WEIGHTED,
        Simulator.CHALLENGE_CENTER_UNWEIGHTED,
        Simulator.CHALLENGE_CORNER,
        Simulator.CHALLENGE_CORNER_WEIGHTED,
        Simulator.CHALLENGE_MIGRATE_DISTANCE,
        Simulator.CHALLENGE_CENTER_SPARSE,
        Simulator.CHALLENGE_LEFT_EIGHTH,
        Simulator.CHALLENGE_RADIOACTIVE_WALLS,
        Simulator.CHALLENGE_AGAINST_ANY_WALL,
        Simulator.CHALLENGE_TOUCH_ANY_WALL,
        Simulator.CHALLENGE_EAST_WEST_EIGHTHS,
        Simulator.CHALLENGE_NEAR_BARRIER,
        Simulator.CHALLENGE_PAIRS,
        Simulator.CHALLENGE_LOCATION_SEQUENCE,
        Simulator.CHALLENGE_ALTRUISM,
        Simulator.CHALLENGE_ALTRUISM_SACRIFICE,
    ]

    constructor() {
        this.runMode = RunMode::STOP

        this.grid = new Grid()        // The 2D world where the creatures live
        this.signals = new Signals()  // A 2D array of pheromones that overlay the world grid
        this.peeps = new Peeps()      // The container of all the individualiduals in the population

        this.paramManager = new ParamManager()


        this.printSensorsActions() // show the agents' capabilities

        // Simulator parameters are available read-only through the global
        // variable p after paramManager is initialized.
        // Todo: remove the hardcoded parameter filename.
        this.paramManager.setDefaults()
        this.paramManager.registerConfigFile(argc > 1 ? argv[1] : "biosim4.ini")
        this.paramManager.updateFromConfigFile(0)
        this.paramManager.checkParameters() // check and report any problems

        randomUint.initialize() // seed the RNG for main-thread use

        // Allocate container space. Once allocated, these container elements
        // will be reused in each new generation.
        this.grid.init(p.sizeX, p.sizeY) // the land on which the peeps live
        this.signals.init(p.signalLayers, p.sizeX, p.sizeY) // where the pheromones waft
        this.peeps.init(p.population) // the peeps themselves

        // If imageWriter is to be run in its own thread, start it here:
        //std::thread t(&ImageWriter::saveFrameThread, &imageWriter);

        // Unit tests:
        //unitTestConnectNeuralNetWiringFromGenome();
        //unitTestGridVisitNeighborhood();

        this.initGeneration() // starting population

        // Inside the parallel region, be sure that shared data is not modified. Do the
        // modifications in the single-thread regions.

        randomUint.initialize() // seed the RNG, each thread has a private instance

        while (this.runMode === RunMode::RUN && this.generation < p.maxGenerations) { // generation loop

            for (let step = 0; step < p.stepsPerGeneration; step++) {
                for (let i = 1; i <= p.population; i++) {
                    if (this.peeps[i].alive) {
                        this.onStep(peeps[i], step)
                    }

                    // In single-thread mode: this executes deferred, queued deaths and movements,
                    // updates signal layers (pheromone), etc.
                    this.murderCount += this.peeps.deathQueueSize()
                    this.endOfStep(step, this.generation)
                }

                this.endOfGeneration(this.generation);
                this.paramManager.updateFromConfigFile(this.generation + 1)
                const numberSurvivors = this.spawnNewGeneration(this.generation, this.murderCount)
                if (numberSurvivors > 0 && (this.generation % p.genomeAnalysisStride === 0)) {
                    this.displaySampleGenomes(p.displaySampleGenomes)
                }

                this.generation = numberSurvivors === 0 ? 0 : this.generation++
            }
        }

        this.displaySampleGenomes(3); // final report, for debugging

        console.log('Simulator exit.')
    }

    initGeneration() {
        this.generation = 0
        this.runMode = RunMode::RUN
        this.murderCount = 0

    }

    spawnNewGeneration(generation, murderCount) {
        let sacrificedCount = 0 // for the altruism challenge

        // This container will hold the indexes and survival scores (0.0..1.0)
        // of all the survivors who will provide genomes for re-population.
        const parents = new Map() // <individual index, score>

        // This container will hold the genomes of the survivors
        const parentGenomes = new Map()

        if (p.challenge !== Simulator.CHALLENGE_ALTRUISM) {
            // First, make a list of all the individuals who will become parents; save
            // their scores for later sorting. Indexes start at 1.
            for (let index = 1; index <= p.population; ++index) {
                let result = this.passedSurvivalCriterion(this.peeps[index], p.challenge)
                // Save the parent genome if it results in valid neural connections
                // ToDo: if the parents no longer need their genome record, we could
                // possibly do a move here instead of copy, although it's doubtful that
                // the optimization would be noticeable.
                if (result.passed && !this.peeps[index].nnet.connections.empty()) {
                    parents.set(index, result.score)
                }
            }
        } else {
            // For the altruism challenge, test if the agent is inside either the sacrificial
            // or the spawning area. We'll count the number in the sacrificial area and
            // save the genomes of the ones in the spawning area, saving their scores
            // for later sorting. Indexes start at 1.
            let considerKinship = true
            const sacrificesIndexes = new Map() // those who gave their lives for the greater good

            for (let index = 1; index <= p.population; ++index) {
                // This the test for the spawning area:
                let result = this.passedSurvivalCriterion(this.peeps[index], Simulator.CHALLENGE_ALTRUISM)
                if (result.passed && !this.peeps[index].nnet.connections.empty()) {
                    parents.push(index, result.score)
                } else {
                    // This is the test for the sacrificial area:
                    result = this.passedSurvivalCriterion(this.peeps[index], Simulator.CHALLENGE_ALTRUISM_SACRIFICE)
                    if (result.passed && !this.peeps[index].nnet.connections.empty()) {
                        if (considerKinship) {
                            sacrificesIndexes.push(index)
                        } else {
                            sacrificedCount++
                        }
                    }
                }
            }

            let generationToApplyKinship = 10
            let altruismFactor = 10 // the saved:sacrificed ratio

            if (considerKinship) {
                if (this.generation > generationToApplyKinship) {
                    // Todo: optimize!!!
                    const threshold = 0.7

                    let survivingKin = []
                    for (let passes = 0; passes < altruismFactor; ++passes) {
                        for (let sacrificedIndex of sacrificesIndexes) {
                            // randomize the next loop, so we don't keep using the first one repeatedly
                            let startIndex = this.randomUint(0, parents.size - 1)
                            for (let count = 0; count < parents.size; count++) {
                                const possibleParent = parents[(startIndex + count) % parents.size]
                                const genomeA = this.peeps[sacrificedIndex].genome
                                const genomeB = this.peeps[possibleParent.first].genome
                                const similarity = this.genomeSimilarity(genomeA, genomeB)
                                if (similarity >= threshold) {
                                    survivingKin.push(possibleParent)
                                    // mark this one, so we don't use it again?
                                    break
                                }
                            }
                        }
                    }
                    console.log(` passed, ${sacrificesIndexes.size} sacrificed, ${survivingKin.length} saved`)
                    survivingKin.forEach((a, i) => parents.set(i, a))
                }
            } else {
                // Limit the parent list
                const numberSaved = sacrificedCount * altruismFactor
                console.log(`${parents.size} passed, ${sacrificedCount} sacrificed, ${numberSaved} saved`)
                if (parents.size !== 0 && numberSaved < parents.size) {
                    parents.erase(parents.begin() + numberSaved, parents.end())
                }
            }
        }

        // Sort the indexes of the parents by their fitness scores
        parents.sort((a, b) => a.second - b.second)

        // Assemble a list of all the parent genomes. These will be ordered by their
        // scores if the parents[] container was sorted by score
        this.parentGenomes = []
        for (let parent of parents) {
            this.parentGenomes.push(this.peeps[parent.passed].genome)
        }

        console.log(`Gen ${generation}, ${parentGenomes.size}  survivors`)
        appendEpochLog(generation, parentGenomes.size, murderCount);
        //displaySignalUse(); // for debugging only

        // Now we have a container of zero or more parents' genomes
        if (!this.parentGenomes.empty()) {
            // Spawn a new generation
            initializeNewGeneration(parentGenomes, generation + 1)
        } else {
            // Special case: there are no surviving parents: start the simulation over
            // from scratch with randomly-generated genomes
            initializeGeneration0()
        }

        return parentGenomes.size
    }

    displaySampleGenomes(count) {
    }

    executeActions() {

    }

    endOfStep(step, generation) {
    }

    endOfGeneration(generation) {

    }

    onStep(individualidual, step) {
        individualidual.age++ // for this implementation, tracks simStep
        const actionLevels = individualidual.feedForward(step)
        this.executeActions(individualidual, actionLevels)
    }

    passedSurvivalCriterion(individual, challenge) {
        const result = {passed: false, score: 0.0}

        if (!individual.alive) return result
        let passed = false
        let score = 0.0

        let safeCenter = new Coord({x: Math.round(p.sizeX / 2.0), y: Math.round(p.sizeY / 2.0)})
        let radius = p.sizeX / 3.0
        let minNeighbors = 22
        let maxNeighbors = 2

        let offset, distance

        let count = 0

        switch (challenge) {
            // Survivors are those inside the circular area defined by
            // safeCenter and radius
            case Simulator.CHALLENGE_CIRCLE:
                safeCenter = new Coord({x: Math.round(p.sizeX / 4.0), y: Math.round(p.sizeY / 4.0)})
                radius = p.sizeX / 4.0

                offset = safeCenter - individual.location
                distance = offset.length()

                passed = distance <= radius
                result.passed = passed
                result.score = passed ? (radius - distance) / radius : 0.0

                return result

            // Survivors are all those on the right side of the arena
            case Simulator.CHALLENGE_RIGHT_HALF:
                passed = individual.location.x > p.sizeX / 2
                result.passed = passed
                result.score = passed ? 1.0 : 0.0

                return result

            // Survivors are all those on the right quarter of the arena
            case Simulator.CHALLENGE_RIGHT_QUARTER:
                passed = individual.location.x > p.sizeX / 2 + p.sizeX / 4
                result.passed = passed
                result.score = passed ? 1.0 : 0.0

                return result

            // Survivors are all those on the left eighth of the arena
            case Simulator.CHALLENGE_LEFT_EIGHTH:
                passed = individual.location.x < p.sizeX / 8
                result.passed = passed
                result.score = passed ? 1.0 : 0.0

                return result

            // Survivors are those not touching the border and with exactly the number
            // of neighbors defined by neighbors and radius, where neighbors includes self
            case Simulator.CHALLENGE_STRING:
                minNeighbors = 22
                maxNeighbors = 2
                radius = 1.5

                if (this.grid.isBorder(individual.location)) return result

                let count = 0
                const f = location => {
                    if (this.grid.isOccupiedAt(location)) ++count
                }

                visitNeighborhood(individual.location, radius, f)
                passed = count >= minNeighbors && count <= maxNeighbors
                result.passed = passed
                result.score = passed ? 1.0 : 0.0

                return result

            // Survivors are those within the specified radius of the center. The score
            // is linearly weighted by distance from the center.
            case Simulator.CHALLENGE_CENTER_WEIGHTED:
                offset = safeCenter - individual.location
                distance = offset.length()

                passed = distance <= radius
                result.passed = passed
                result.score = passed ? (radius - distance) / radius : 0.0

                return result

            // Survivors are those within the specified radius of the center
            case Simulator.CHALLENGE_CENTER_UNWEIGHTED:
                offset = safeCenter - individual.location
                distance = offset.length()

                passed = distance <= radius
                result.passed = passed
                result.score = passed ? 1.0 : 0.0

                return result

            // Survivors are those within the specified outer radius of the center and with
            // the specified number of neighbors in the specified inner radius.
            // The score is not weighted by distance from the center.
            case Simulator.CHALLENGE_CENTER_SPARSE:
                const outerRadius = p.sizeX / 4.0
                const innerRadius = 1.5
                minNeighbors = 5  // includes self
                maxNeighbors = 8

                offset = safeCenter - individual.location
                distance = offset.length()

                passed = distance <= outerRadius
                if (passed) {
                    let count = 0
                    const f = location => {
                        if (this.grid.isOccupiedAt(location)) ++count
                    }

                    this.visitNeighborhood(individual.location, innerRadius, f)
                    passed = count >= minNeighbors && count <= maxNeighbors
                }

                result.passed = passed
                result.score = passed ? 1.0 : 0.0

                return result

            // Survivors are those within the specified radius of any corner.
            // Assumes square arena.
            case Simulator.CHALLENGE_CORNER:
                radius = p.sizeX / 8.0
                distance = (new Coord(0, 0) - individual.location).length()

                if (distance <= radius) {
                    result.passed = true
                    result.score = 1.0

                    return result
                }

                distance = (new Coord(0, p.sizeY - 1) - individual.location).length()
                if (distance <= radius) {
                    result.passed = true
                    result.score = 1.0

                    return result
                }

                distance = (new Coord(p.sizeX - 1, 0) - individual.location).length()
                if (distance <= radius) {
                    result.passed = true
                    result.score = 1.0

                    return result
                }

                distance = (new Coord(p.sizeX - 1, p.sizeY - 1) - individual.location).length()
                if (distance <= radius) {
                    result.passed = true
                    result.score = 1.0

                    return result
                }

                return result

            // Survivors are those within the specified radius of any corner. The score
            // is linearly weighted by distance from the corner point.
            case Simulator.CHALLENGE_CORNER_WEIGHTED:
                radius = p.sizeX / 4.0
                distance = (new Coord(0, 0) - individual.location).length()
                score = (radius - distance) / radius

                if (distance <= radius) {
                    result.passed = true
                    result.score = score

                    return result
                }

                distance = (new Coord(0, p.sizeY - 1) - individual.location).length();
                if (distance <= radius) {
                    result.passed = true
                    result.score = score

                    return result
                }

                distance = (new Coord(p.sizeX - 1, 0) - individual.location).length();
                if (distance <= radius) {
                    result.passed = true
                    result.score = score

                    return result
                }

                distance = (new Coord(p.sizeX - 1, p.sizeY - 1) - individual.location).length()
                if (distance <= radius) {
                    result.passed = true
                    result.score = score

                    return result
                }

                return result

            // This challenge is handled in endOfSimStep(), where individualiduals may die
            // at the end of any sim step. There is nothing else to do here at the
            // end of a generation. All remaining alive become parents.
            case Simulator.CHALLENGE_RADIOACTIVE_WALLS:
                result.passed = true
                result.score = 1.0

                return result

            // Survivors are those touching any wall at the end of the generation
            case Simulator.CHALLENGE_AGAINST_ANY_WALL:
                passed = individual.location.x === 0 || individual.location.x === p.sizeX - 1
                    || individual.location.y === 0 || individual.location.y === p.sizeY - 1
                result.passed = passed
                result.score = passed ? 1.0 : 0.0

                return result

            // This challenge is partially handled in endOfSimStep(), where individuals
            // that are touching a wall are flagged in their individual record. They are
            // allowed to continue living. Here at the end of the generation, any that
            // never touch a wall will die. All that touched a wall at any time during
            // their life will become parents.
            case Simulator.CHALLENGE_TOUCH_ANY_WALL:
                passed = individual.challengeBits !== 0
                result.passed = passed
                result.score = passed ? 1.0 : 0.0

                return result

            // Everybody survives and are candidate parents, but scored by how far
            // they migrated from their birth location.
            case Simulator.CHALLENGE_MIGRATE_DISTANCE:
                //unsigned requiredDistance = p.sizeX / 2.0;
                distance = (individual.location - individual.birthLocation).length()

                result.passed = true
                result.score = distance / Math.max(p.sizeX, p.sizeY)

                return result

            // Survivors are all those on the left or right eighths of the arena
            case Simulator.CHALLENGE_EAST_WEST_EIGHTHS:
                passed = individual.location.x < p.sizeX / 8 || individual.location.x >= (p.sizeX - p.sizeX / 8)

                result.passed = passed
                result.score = passed ? 1.0 : 0.0

                return result

            // Survivors are those within radius of any barrier center. Weighted by distance.
            case Simulator.CHALLENGE_NEAR_BARRIER: {
                //radius = 20.0;
                radius = p.sizeX / 2;
                //radius = p.sizeX / 4;

                const barrierCenters = grid.getBarrierCenters()

                let minDistance = 1e8
                for (let  center of barrierCenters ) {
                    distance = (individual.location - center).length()
                    if (distance < minDistance) minDistance = distance
                }

                passed = minDistance <= radius

                result.passed = passed
                result.score = passed ? 1.0 -(minDistance / radius) : 0.0

                return result
            }

            // Survivors are those not touching a border and with exactly one neighbor which has no other neighbor
            case Simulator.CHALLENGE_PAIRS: {
                const onEdge = individual.location.x === 0 || individual.location.x === p.sizeX - 1
                    || individual.location.y === 0 || individual.location.y === p.sizeY - 1

                if (onEdge) return result

                count = 0
                for (let x = individual.location.x - 1; x <= individual.location.x + 1; ++x) {
                    for (let y = individual.location.y - 1; y <= individual.location.y + 1; ++y) {
                        const tloc = new Coord({ x, y })
                        if (!tloc.equal(individual.location) && this.grid.isInBounds(tloc) && this.grid.isOccupiedAt(tloc)) {
                            count++
                            if (count === 1) {
                                for (let x1 = tloc.x - 1; x1 <= tloc.x + 1; ++x1) {
                                    for (let y1 = tloc.y - 1; y1 <= tloc.y + 1; ++y1) {
                                        const tloc1 = new Coord({ x, y })
                                        if (!tloc1.equal(tloc) && !tloc1.equal(individual.location) && this.grid.isInBounds(tloc1) && this.grid.isOccupiedAt(tloc1)) return result
                                    }
                                }
                            } else return result
                        }
                    }
                }
                passed = count === 1

                result.passed = passed
                result.score = passed ? 1.0 : 0.0

                return result
            }

            // Survivors are those that contacted one or more specified locations in a sequence,
            // ranked by the number of locations contacted. There will be a bit set in their
            // challengeBits member for each location contacted.
            case Simulator.CHALLENGE_LOCATION_SEQUENCE:
                count = 0
                const bits = individual.challengeBits
                const maxNumberOfBits = sizeof(bits) * 8

                for (let n = 0; n < maxNumberOfBits; n++) {
                    if ((bits & (1 << n)) !== 0) count++
                }

                passed = count > 0

                result.passed = passed
                result.score = passed ? count / maxNumberOfBits : 0.0

                return result

            // Survivors are all those within the specified radius of the NE corner
            case Simulator.CHALLENGE_ALTRUISM_SACRIFICE:
                safeCenter = new Coord({x: p.sizeX - p.sizeX / 4, y: p.sizeY - p.sizeY / 4})
                //radius = p.sizeX / 3.0; // in 128^2 world, holds 1429 agents
                radius = p.sizeX / 4.0 // in 128^2 world, holds 804 agents
                //radius = p.sizeX / 5.0; // in 128^2 world, holds 514 agents

                distance = (safeCenter - individual.location).length()
                passed = distance <= radius

                result.passed = passed
                result.score = passed ? (radius - distance) / radius : 0.0

                return result

            // Survivors are those inside the circular area defined by
            // safeCenter and radius
            case Simulator.CHALLENGE_ALTRUISM:
                safeCenter = new Coord(p.sizeX / 4.0, p.sizeY / 4.0)
                radius = p.sizeX / 4.0 // in a 128^2 world, holds 3216
                offset = safeCenter - individual.location
                distance = offset.length()
                passed = distance <= radius

                result.passed = passed
                result.score = passed ? (radius - distance) / radius : 0.0

                return result
            default:
                return result
        }
    }
}
