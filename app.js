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
    }
    async loopActionCardRunListener(args, state, type) {
        let { delay } = args;
        if (args.durationInUnits === 'seconds') {
            delay *= 1000;
        }
        if (args.durationInUnits === 'minutes') {
            delay *= 1000 * 60;
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
        }
        await this.loopFinishedTriggerCard?.trigger({}, { name: args.name.name });
    }
    async iterateLoopActionCard(times, loopName, delay) {
        return new Promise((resolve) => {
            this.loopIteratesTriggerCard?.trigger({ iteration: 1, maxIterations: times, value: 0 }, { name: loopName });
            let i = 1;
            const intervalId = setInterval(async () => {
                await this.loopIteratesTriggerCard?.trigger({ iteration: i + 1, maxIterations: times, value: 0 }, { name: loopName });
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
        if (identifier === undefined) {
            this.runningLoops[loopName].forEach((id) => {
                clearInterval(id);
            });
            this.runningLoops[loopName] = [];
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
