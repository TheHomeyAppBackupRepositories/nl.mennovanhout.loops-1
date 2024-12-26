"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const homey_1 = __importDefault(require("homey"));
class Loops extends homey_1.default.App {
    constructor() {
        super(...arguments);
        this.runningLoops = {};
    }
    async onInit() {
        // Trigger cards
        this.loopStartedTriggerCard = this.homey.flow.getTriggerCard('when-loop-with-name-started');
        this.loopStartedTriggerCard.registerArgumentAutocompleteListener('name', this.loopNameAutocompleteListener.bind(this));
        this.loopStartedTriggerCard.on('update', this.saveLoopNames.bind(this));
        this.loopStartedTriggerCard.registerRunListener(async (args, state) => {
            return args.name.name === state.name;
        });
        this.loopIteratesTriggerCard = this.homey.flow.getTriggerCard('when-loop-with-name-iterates');
        this.loopIteratesTriggerCard.registerArgumentAutocompleteListener('name', this.loopNameAutocompleteListener.bind(this));
        this.loopIteratesTriggerCard.on('update', this.saveLoopNames.bind(this));
        this.loopIteratesTriggerCard.registerRunListener(async (args, state) => {
            return args.name.name === state.name;
        });
        this.loopFinishedTriggerCard = this.homey.flow.getTriggerCard('when-loop-with-name-finished');
        this.loopFinishedTriggerCard.registerArgumentAutocompleteListener('name', this.loopNameAutocompleteListener.bind(this));
        this.loopFinishedTriggerCard.on('update', this.saveLoopNames.bind(this));
        this.loopFinishedTriggerCard.registerRunListener(async (args, state) => {
            return args.name.name === state.name;
        });
        // Condition cards
        this.andLoopIsRunningCard = this.homey.flow.getConditionCard('loop-with-name-is-running');
        this.andLoopIsRunningCard.registerArgumentAutocompleteListener('name', this.loopNameAutocompleteListener.bind(this));
        this.andLoopIsRunningCard.on('update', this.saveLoopNames.bind(this));
        this.andLoopIsRunningCard.registerRunListener(async (args, state) => {
            return (this.runningLoops[args.name.name] || []).length > 0;
        });
        // Action cards
        this.startLoopActionCardTimes = this.homey.flow.getActionCard('then-start-loop-with-name');
        this.startLoopActionCardTimes.registerArgumentAutocompleteListener('name', this.loopNameAutocompleteListener.bind(this));
        this.startLoopActionCardTimes.on('update', this.saveLoopNames.bind(this));
        this.startLoopActionCardTimes.registerRunListener((args, state) => {
            this.loopActionCardRunListener(args, state, 'times');
        });
        this.startLoopActionCardUntil = this.homey.flow.getActionCard('then-start-loop-with-name-until');
        this.startLoopActionCardUntil.registerArgumentAutocompleteListener('name', this.loopNameAutocompleteListener.bind(this));
        this.startLoopActionCardUntil.on('update', this.saveLoopNames.bind(this));
        this.startLoopActionCardUntil.registerRunListener((args, state) => {
            this.loopActionCardRunListener(args, state, 'until');
        });
        this.killLoopActionCard = this.homey.flow.getActionCard('then-kill-loop-with-name');
        this.killLoopActionCard.registerArgumentAutocompleteListener('name', this.loopNameAutocompleteListener.bind(this));
        this.killLoopActionCard.on('update', this.saveLoopNames.bind(this));
        this.killLoopActionCard.registerRunListener(async (args, state) => {
            this.stopInterval(args.name.name);
            if (args.triggerKillCard) {
                await this.loopFinishedTriggerCard?.trigger({}, { name: args.name.name });
            }
        });
        this.killAllLoopsActionCard = this.homey.flow.getActionCard('then-kill-all-loops');
        this.killAllLoopsActionCard.registerRunListener(async (args, state) => {
            for (const loopName in this.runningLoops) {
                this.stopInterval(loopName);
                if (args.triggerKillCard) {
                    await this.loopFinishedTriggerCard?.trigger({}, { name: loopName });
                }
            }
        });
        this.startManualLoopCard = this.homey.flow.getActionCard('start-manual-loop-with-name');
        this.startManualLoopCard.registerArgumentAutocompleteListener('name', this.loopNameAutocompleteListener.bind(this));
        this.startManualLoopCard.registerRunListener(async (args, state) => {
            this.loopActionCardRunListener(args, state, 'manual');
        });
        this.goToNextIterationCard = this.homey.flow.getActionCard('go-to-next-iteration');
        this.goToNextIterationCard.registerArgumentAutocompleteListener('name', this.loopNameAutocompleteListener.bind(this));
        this.goToNextIterationCard.registerRunListener(this.goToNextIteration.bind(this));
    }
    async goToNextIteration(args, state) {
        let { name } = args;
        name = name.name;
        if (!this.runningLoops[name]) {
            throw Error('Loop is not running');
        }
        if (this.runningLoops[name][0].max === undefined) {
            throw Error('This is not a manual loop');
        }
        this.runningLoops[name][0].current++;
        this.loopIteratesTriggerCard?.trigger({ iteration: this.runningLoops[name][0].current, maxIterations: this.runningLoops[name][0].max, value: this.runningLoops[name][0].current }, { name: name });
        if (this.runningLoops[name][0].current >= this.runningLoops[name][0].max) {
            // Trigger finished card
            await this.loopFinishedTriggerCard?.trigger({}, { name: name });
            delete this.runningLoops[name];
        }
    }
    async loopActionCardRunListener(args, state, type) {
        let { delay } = args;
        // Manuall cards can only have 1 at the same time
        if (type === 'manual' && this.runningLoops[args.name.name] !== undefined) {
            throw Error('Loop already running');
        }
        if (args.durationInUnits === 'seconds') {
            delay *= 1000;
        }
        if (args.durationInUnits === 'minutes') {
            delay *= 1000 * 60;
        }
        if (type == 'times' && args.times == 0) {
            throw ('Loop count needs to be higher than 0');
            return;
        }
        await this.loopStartedTriggerCard?.trigger({}, { name: args.name.name });
        switch (type) {
            default:
            case 'times':
                await this.iterateLoopActionCard(args.times, args.name.name, delay);
                break;
            case 'until':
                await this.untilLoopActionCard(args.from, args.to, args.steps, args.name.name, delay);
                break;
            case 'manual':
                await this.manualLoopActionCard(args.name.name, args.times);
                break;
        }
        if (type === 'manual') {
            return;
        }
        await this.loopFinishedTriggerCard?.trigger({}, { name: args.name.name });
    }
    async iterateLoopActionCard(times, loopName, delay) {
        return new Promise((resolve) => {
            this.loopIteratesTriggerCard?.trigger({ iteration: 1, maxIterations: times, value: 0 }, { name: loopName });
            let i = 1;
            const intervalId = setInterval(async () => {
                await this.loopIteratesTriggerCard?.trigger({ iteration: i + 1, maxIterations: times, value: i }, { name: loopName });
                if (++i === times) {
                    this.stopInterval(loopName, intervalId);
                    resolve(true);
                }
            }, delay);
            this.addLoopToRunningList(loopName, intervalId);
        });
    }
    async untilLoopActionCard(from, to, steps, loopName, delay) {
        return new Promise((resolve) => {
            let i = 1;
            this.loopIteratesTriggerCard?.trigger({ iteration: 1, maxIterations: steps, value: from }, { name: loopName });
            const valuePerStep = Math.abs(from - to) / steps;
            if (from > to) {
                const intervalId = setInterval(async () => {
                    from -= valuePerStep;
                    await this.loopIteratesTriggerCard?.trigger({ iteration: i, maxIterations: steps, value: from }, { name: loopName });
                    if (from <= to) {
                        this.stopInterval(loopName, intervalId);
                        resolve(true);
                    }
                    i++;
                }, delay);
                this.addLoopToRunningList(loopName, intervalId);
            }
            else if (from < to) {
                const intervalId = setInterval(async () => {
                    from += valuePerStep;
                    await this.loopIteratesTriggerCard?.trigger({ iteration: i, maxIterations: steps, value: from }, { name: loopName });
                    if (from >= to) {
                        this.stopInterval(loopName, intervalId);
                        resolve(true);
                    }
                    i++;
                }, delay);
                this.addLoopToRunningList(loopName, intervalId);
            }
            else {
                resolve(true);
            }
        });
    }
    async manualLoopActionCard(loopName, times) {
        if (!this.runningLoops[loopName]) {
            this.runningLoops[loopName] = [];
        }
        this.runningLoops[loopName].push({
            current: 1,
            max: times
        });
        this.loopIteratesTriggerCard?.trigger({ iteration: 1, maxIterations: times, value: 0 }, { name: loopName });
    }
    addLoopToRunningList(loopName, identifier) {
        if (!this.runningLoops[loopName]) {
            this.runningLoops[loopName] = [];
        }
        this.runningLoops[loopName].push(identifier);
    }
    stopInterval(loopName, identifier = undefined) {
        if (!this.runningLoops[loopName]) {
            return;
        }
        if (this.runningLoops[loopName][0].max !== undefined) {
            this.runningLoops[loopName] = [];
            delete this.runningLoops[loopName];
            return;
        }
        if (identifier === undefined) {
            this.runningLoops[loopName].forEach((id) => {
                clearInterval(id);
            });
            this.runningLoops[loopName] = [];
            delete this.runningLoops[loopName];
            return;
        }
        clearInterval(identifier);
        const index = this.runningLoops[loopName].indexOf(identifier);
        this.runningLoops[loopName].splice(index, 1);
    }
    async loopNameAutocompleteListener(query, args) {
        const loopNames = (this.homey.settings.get('loopNames') || []).map((name) => {
            return {
                name,
            };
        });
        const results = [...loopNames];
        if (this.justAdded) {
            results.push({
                name: this.justAdded,
                description: 'Just added',
            });
        }
        if (query.length > 0) {
            if (!results.find((result) => result.name.toLowerCase() === query.toLowerCase())) {
                results.push({
                    name: query,
                    description: 'Create new loop',
                });
            }
            this.justAdded = query;
        }
        return results.filter((result) => result.name.toLowerCase().includes(query.toLowerCase()));
    }
    async saveLoopNames() {
        const loopCards = [
            this.loopStartedTriggerCard,
            this.loopIteratesTriggerCard,
            this.loopFinishedTriggerCard,
            this.startLoopActionCardTimes,
            this.startLoopActionCardUntil,
            this.killLoopActionCard,
            this.andLoopIsRunningCard,
            this.startManualLoopCard,
            this.goToNextIterationCard
        ];
        const loopNames = [];
        for (const loopCard of loopCards) {
            const loopCardValues = (await loopCard?.getArgumentValues())?.map((arg) => arg.name.name);
            if (loopCardValues) {
                loopNames.push(...loopCardValues);
            }
        }
        this.homey.settings.set('loopNames', [...new Set(loopNames)]);
    }
}
module.exports = Loops;
