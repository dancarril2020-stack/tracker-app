import puppeteer from 'puppeteer';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';

async function runTest() {
    console.log("Starting Bug Reproduction Test...");
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Capture logs
    page.on('dialog', async dialog => {
        console.log(`Alert message: ${dialog.message()}`);
        await dialog.accept();
    });
    page.on('console', async msg => {
        const args = await Promise.all(msg.args().map(arg => arg.jsonValue()));
        console.log('PAGE LOG:', msg.text(), args);
    });
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    page.on('requestfailed', request => {
        console.log(`REQUEST FAILED: ${request.url()} ${request.failure() ? request.failure().errorText : ''}`);
        // Log status if available
        if (request.response()) {
            console.log(`REQUEST FAILED STATUS: ${request.response().status()}`);
        }
    });

    try {
        // --- STEP 1: LOGIN AS OFFICE ---
        console.log("--- Step 1: Login as Office ---");
        await page.goto(BASE_URL);

        // Wait for body to ensure page loaded
        await page.waitForSelector('body', { timeout: 10000 });
        console.log("Page body loaded.");

        try {
            await page.waitForSelector('input[type="email"]', { timeout: 10000 });
        } catch (e) {
            console.log("TIMEOUT WAITING FOR EMAIL INPUT. Dumping HTML to file:");
            const html = await page.content();
            fs.writeFileSync('debug_failed_page.html', html);
            console.log("HTML dumped to debug_failed_page.html");
            throw e;
        }
        await page.type('input[type="email"]', 'office@tvr.com');
        await page.type('input[type="password"]', 'password');
        await page.click('button[type="submit"]');

        await page.waitForSelector('.tabs', { timeout: 10000 });
        console.log("Logged in as Office.");

        // --- STEP 2: ASSIGN LOAD TO DANIEL ---
        console.log("--- Step 2: Assign Load ---");
        // Ensure we are on Loads tab (usually default for Office, but let's click)
        const tabs = await page.$$('.tab-button');
        for (const t of tabs) {
            const text = await page.evaluate(el => el.textContent, t);
            if (text.includes('Loads')) await t.click();
        }
        await new Promise(r => setTimeout(r, 1000));

        // Find Driver Dropdown
        // It's inside the 'New Assignment' form
        await page.waitForSelector('select');

        // Select Daniel (Value unknown, search by text)
        const val = await page.evaluate(() => {
            const options = Array.from(document.querySelectorAll('select option'));
            const target = options.find(o => o.textContent.toLowerCase().includes('daniel'));
            return target ? target.value : null;
        });

        if (!val) throw new Error("Daniel user not found in dropdown!");
        await page.select('select', val);

        // Fill Form
        await page.type('input[name="recipient"]', 'Bug Reproduction Load');
        await page.type('input[name="remittance"]', 'BUG-' + Date.now());
        await page.type('input[name="quantity"]', '50');

        // Submit
        const forms = await page.$$('form');
        const submitBtn = await forms[0].$('button[type="submit"]');
        await submitBtn.click();

        console.log("Load Assigned.");
        await new Promise(r => setTimeout(r, 2000)); // Wait for write

        // --- STEP 3: LOGOUT ---
        const buttons = await page.$$('header button');
        // Find button that contains "Log Out"
        let logoutBtn;
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.includes("Log Out")) {
                logoutBtn = btn;
                break;
            }
        }
        await logoutBtn.click();
        await page.waitForSelector('input[type="email"]');

        // --- STEP 4: LOGIN AS DRIVER ---
        console.log("--- Step 4: Login as Daniel ---");
        await page.type('input[type="email"]', 'danielcarril@tvr.com');
        await page.type('input[type="password"]', 'password123');
        await page.click('button[type="submit"]');
        await page.waitForSelector('.tabs');

        // --- STEP 5: EDIT THE LOAD ---
        console.log("--- Step 5: Details/Edit ---");
        // Driver should land on Loads tab or navigate there
        const driverTabs = await page.$$('.tab-button');
        for (const t of driverTabs) {
            const text = await page.evaluate(el => el.textContent, t);
            if (text.includes('Loads')) await t.click();
        }

        // Find the Card
        // Find the Card
        console.log("Looking for card...");
        const card = await page.waitForFunction(() => {
            const h3s = Array.from(document.querySelectorAll('h3'));
            const target = h3s.find(el => el.textContent.includes('Bug Reproduction Load'));
            return target ? target.closest('.card') : null;
        }, { timeout: 10000 });

        // Get the edit button using evaluate to be safe
        await page.evaluate(() => {
            const h3s = Array.from(document.querySelectorAll('h3'));
            const card = h3s.find(el => el.textContent.includes('Bug Reproduction Load')).closest('.card');
            const buttons = Array.from(card.querySelectorAll('button'));
            const editBtn = buttons.find(btn => btn.textContent.toLowerCase().includes('edit')) || buttons[buttons.length - 1];
            editBtn.click();
        });
        console.log("Clicked Edit Button.");

        // Wait for Modal and Save
        await page.waitForSelector('div[style*="fixed"]'); // Modal overlay
        console.log("Modal opened.");

        // Change Quantity
        // Type 99 (Simulate edit)
        // We target the input inside the modal specifically
        await page.evaluate(() => {
            // Basic selector might pick up the background form input, so we need to be precise
            // The modal is usually at the end of the body
            const modal = document.body.lastElementChild;
            const input = modal.querySelector('input[name="quantity"]');
            if (input) input.value = '99';
        });

        const saveBtns = await page.$x("//button[contains(., 'Save Changes')]");
        if (saveBtns.length > 0) {
            await saveBtns[0].click();
            console.log("Clicked Save Changes.");
        } else {
            throw new Error("Save button missing");
        }

        // Wait for potential alert or console error
        await new Promise(r => setTimeout(r, 3000));
        console.log("Test Finished (Check logs for errors).");

    } catch (err) {
        console.error("TEST FAILED:", err);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

runTest();
