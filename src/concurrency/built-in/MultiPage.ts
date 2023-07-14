import * as puppeteer from "puppeteer";

import { ResourceData } from "../ConcurrencyImplementation";
import MultiBrowserImplementation from "../MultiBrowserImplementation";

export default class MultiPage extends MultiBrowserImplementation {
    protected async createResources(browserIndex: number): Promise<ResourceData> {
        return {
            page: await (this.browsers[browserIndex] as puppeteer.Browser).newPage(),
        };
    }

    protected async freeResources(resources: ResourceData): Promise<void> {
        await resources.page.close();
    }
}
