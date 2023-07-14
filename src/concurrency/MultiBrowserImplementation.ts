import * as puppeteer from "puppeteer";
import ConcurrencyImplementation, { ResourceData } from "./ConcurrencyImplementation";

import { debugGenerator, timeoutExecute } from "../util";
const debug = debugGenerator("MultipleBrowserImpl");

const BROWSER_TIMEOUT = 5000;

export default abstract class MultipleBrowserImplementation extends ConcurrencyImplementation {
    protected browsers: puppeteer.Browser[] = [];
    private maxWorkers: number = 5;

    private repairing: boolean[] = [];
    private repairRequested: boolean[] = [];
    private openInstances: number[] = [];
    private waitingForRepairResolvers: (() => void)[][] = [];

    public constructor(options: puppeteer.LaunchOptions, puppeteer: any) {
        super(options, puppeteer);
    }

    private async repair(browserIndex: number) {
        if (this.openInstances[browserIndex] !== 0 || this.repairing[browserIndex]) {
            // already repairing or there are still pages open? wait for start/finish
            await new Promise<void>((resolve) => this.waitingForRepairResolvers[browserIndex].push(resolve));
            return;
        }

        this.repairing[browserIndex] = true;
        debug(`Starting repair for browser ${browserIndex}`);

        try {
            // will probably fail, but just in case the repair was not necessary
            await this.browsers[browserIndex].close();
        } catch (e) {
            debug(`Unable to close browser ${browserIndex}.`);
        }

        try {
            this.browsers[browserIndex] = (await this.puppeteer.launch(this.options)) as puppeteer.Browser;
        } catch (err) {
            throw new Error(`Unable to restart browser ${browserIndex}.`);
        }
        this.repairRequested[browserIndex] = false;
        this.repairing[browserIndex] = false;
        this.waitingForRepairResolvers[browserIndex].forEach((resolve) => resolve());
        this.waitingForRepairResolvers[browserIndex] = [];
    }

    public async init() {
        const maxWorkers = this.maxWorkers || 1;
        for (let i = 0; i < maxWorkers; i++) {
            const browser = await this.puppeteer.launch(this.options);
            this.browsers.push(browser);
            this.repairing.push(false);
            this.repairRequested.push(false);
            this.openInstances.push(0);
            this.waitingForRepairResolvers.push([]);
        }
    }

    public async close() {
        for (const browser of this.browsers) {
            await browser.close();
        }
    }

    protected abstract createResources(browserIndex: number): Promise<ResourceData>;

    protected abstract freeResources(resources: ResourceData): Promise<void>;

    public async workerInstance() {
        let resources: ResourceData;
        let browserIndex: number | null = null;

        return {
            jobInstance: async () => {
                if (browserIndex === null || this.repairRequested[browserIndex]) {
                    if (browserIndex !== null) {
                        await this.repair(browserIndex);
                    }
                    browserIndex = this.getAvailableBrowserIndex();
                }

                await timeoutExecute(
                    BROWSER_TIMEOUT,
                    (async () => {
                        resources = await this.createResources(browserIndex);
                    })()
                );
                this.openInstances[browserIndex] += 1;

                return {
                    resources,

                    close: async () => {
                        if (browserIndex) {
                            this.openInstances[browserIndex] -= 1; // decrement first in case of error
                            await timeoutExecute(BROWSER_TIMEOUT, this.freeResources(resources));

                            if (this.repairRequested[browserIndex]) {
                                await this.repair(browserIndex);
                            }
                        }
                    },
                };
            },

            close: async () => {},

            repair: async () => {
                debug(`Repair requested for browser ${browserIndex}`);
                if (browserIndex) {
                    this.repairRequested[browserIndex] = true;
                    await this.repair(browserIndex);
                }
            },
        };
    }

    private getAvailableBrowserIndex(): number {
        let minInstances = Infinity;
        let browserIndex = 0;

        for (let i = 0; i < this.openInstances.length; i++) {
            if (this.openInstances[i] < minInstances) {
                minInstances = this.openInstances[i];
                browserIndex = i;
            }
        }

        return browserIndex;
    }
}
