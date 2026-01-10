
import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:5174';

async function runTest() {
    console.log("Starting End-to-End Test...");
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Allow dialogs (alerts) to be accepted automatically
    page.on('dialog', async dialog => {
        console.log(`Alert message: ${dialog.message()}`);
        await dialog.accept();
    });

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

    try {
        // --- PART 1: OFFICE USER - CREATE NEW USER ---
        console.log("--- Step 1: Login as Office ---");
        await page.goto(BASE_URL);
        await page.waitForSelector('input[type="email"]');
        await page.type('input[type="email"]', 'office@tvr.com');
        await page.type('input[type="password"]', 'password');
        await page.click('button[type="submit"]');

        await page.waitForSelector('.tabs', { timeout: 5000 });
        console.log("Logged in as Office.");

        console.log("--- Step 2: Create User Daniel Carril ---");
        // Click Users tab - find button with text 'Users'
        const tabs = await page.$$('.tab-button');
        let usersTab;
        for (const t of tabs) {
            const text = await page.evaluate(el => el.textContent, t);
            if (text.includes('Users')) usersTab = t;
        }
        if (!usersTab) throw new Error("Users tab not found");
        await usersTab.click();

        // Fill Form
        await page.waitForSelector('input[placeholder="e.g. John Doe"]');
        await page.type('input[placeholder="e.g. John Doe"]', 'Daniel Carril'); // Name
        await page.type('input[placeholder="e.g. john@tvr.com"]', 'danielcarril@tvr.com'); // Email

        // Select Driver role (default is correct, but let's ensure)
        await page.select('select', 'driver');

        // Submit
        const createBtns = await page.$$('button');
        let createBtn;
        for (const b of createBtns) {
            const text = await page.evaluate(el => el.textContent, b);
            if (text.includes('Create User')) createBtn = b;
        }
        if (createBtn) await createBtn.click();
        else throw new Error("Create User button not found");

        // Wait for success message or simply wait a bit
        // The app shows a success message in green
        await new Promise(r => setTimeout(r, 1000));
        console.log("User creation attempted.");

        // Logout
        // Use CSS selector for button in header
        await page.waitForSelector('header button');
        await page.click('header button');
        await page.waitForSelector('input[type="email"]');
        console.log("Logged out.");


        // --- PART 2: DRIVER USER - CREATE RECORDS ---
        console.log("--- Step 3: Login as Driver (driver@tvr.com) ---");
        // NOTE: We test with 'driver@tvr.com' first as requested, then 'danielcarril' if needed. 
        // The prompt asked to test "users driver@tvr.com and danielcarril@tvr.com".
        // Let's test driver@tvr.com for the records creation to save time, or do both?
        // Prompt: "autotest the users driver@tvr.com and danielcarril@tvr.com making new loads, deliveries andd pickups"

        // Let's iterate through both users
        const testUsers = ['driver@tvr.com', 'danielcarril@tvr.com'];

        for (const email of testUsers) {
            console.log(`\nTesting flows for user: ${email}`);

            // Login
            await page.waitForSelector('input[type="email"]');

            // Clear inputs
            await page.evaluate(() => {
                document.querySelector('input[type="email"]').value = '';
                document.querySelector('input[type="password"]').value = '';
            });

            await page.type('input[type="email"]', email);
            await page.type('input[type="password"]', 'password');
            await page.click('button[type="submit"]');
            await page.waitForSelector('.tabs');
            console.log(`Logged in as ${email}`);

            // A. Create Load
            console.log("  Creating Load...");
            // Load tab is default active
            await page.waitForSelector('input[name="recipient"]');
            await page.type('input[name="recipient"]', 'Client Load');
            await page.type('input[name="remittance"]', 'LOAD-' + Date.now());
            await page.type('input[name="quantity"]', '10');
            // Click Register
            let submitBtn = await page.$('button[type="submit"]');
            await submitBtn.click();
            await new Promise(r => setTimeout(r, 500)); // wait for alert/process

            // B. Create Delivery
            console.log("  Creating Delivery...");
            const buttons = await page.$$('.tab-button');
            for (const b of buttons) {
                const t = await page.evaluate(el => el.textContent, b);
                if (t.includes('Deliveries')) await b.click();
            }
            // Wait for form
            await new Promise(r => setTimeout(r, 200));
            await page.type('input[name="recipient"]', 'Client Delivery');
            await page.type('input[name="remittance"]', 'DEL-' + Date.now());
            await page.type('input[name="quantity"]', '5');
            submitBtn = await page.$('button[type="submit"]');
            await submitBtn.click();
            await new Promise(r => setTimeout(r, 500));

            // C. Create Pickup
            console.log("  Creating Pickup...");
            for (const b of buttons) {
                const t = await page.evaluate(el => el.textContent, b);
                if (t.includes('Pick-ups')) await b.click();
            }
            await new Promise(r => setTimeout(r, 200));
            await page.type('input[name="recipient"]', 'Client Pickup');
            await page.type('input[name="remittance"]', 'PICK-' + Date.now());
            await page.type('input[name="quantity"]', '3');
            submitBtn = await page.$('button[type="submit"]');
            await submitBtn.click();
            await new Promise(r => setTimeout(r, 500));

            // Logout
            // Logout
            await page.waitForSelector('header button');
            await page.click('header button');
            await page.waitForSelector('input[type="email"]');
            console.log(`Flow complete for ${email}`);
        }

        console.log("\nALL TESTS PASSED SUCCESSFULLY!");

    } catch (error) {
        console.error("Test Failed:", error);
        await page.screenshot({ path: 'test-failure.png' });
        console.log("Screenshot saved to test-failure.png");

        // Log active tab
        const activeTab = await page.evaluate(() => {
            const active = document.querySelector('.tab-button.active');
            return active ? active.textContent : 'NONE';
        });
        console.log("Active Tab on Failure:", activeTab);

        const html = await page.content();
        console.log("Page Content (First 20000 chars):", html.substring(0, 20000));
        process.exit(1);
    } finally {
        await browser.close();
    }
}

runTest();
