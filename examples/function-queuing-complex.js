const { Cluster } = require("../dist");

(async () => {
    const cluster = await Cluster.launch({
        concurrency: Cluster.CONCURRENCY_CONTEXT,
        maxConcurrency: 2,
    });

    // We don't define a task and instead use own functions
    const screenshot = async ({ page, data: url }) => {
        await page.goto(url);
        const path = url.replace(/[^a-zA-Z]/g, "_") + ".png";
        await page.screenshot({ path });
    };

    const extractTitle = async ({ page, data: url }) => {
        await page.goto(url);
        const pageTitle = await page.evaluate(() => document.title);
        console.log(`Page title is ${pageTitle}`);
    };

    // Make screenshots
    cluster.queue({ data: "https://www.google.com/" }, screenshot);
    cluster.queue({ data: "https://github.com/" }, screenshot);

    // But also do some other stuff
    cluster.queue({ data: "https://reddit.com/" }, extractTitle);
    cluster.queue({ data: "https://twitter.com/" }, extractTitle);

    // We can still define single functions
    cluster.queue({
        taskFunction: async ({ page }) => {
            await page.goto("https://www.google.com/");
            // ...
            console.log("Went to google.com");
        },
    });

    await cluster.idle();
    await cluster.close();
})();
