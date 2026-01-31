
import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:3000';

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
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

    try {
        // --- STEP 1: LOGIN AS OFFICE ---
        console.log("--- Step 1: Login as Office ---");
        await page.goto(BASE_URL);
        await page.waitForSelector('input[type="email"]');
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
        await page.click('header button'); // Logout is the only button in header usually
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
        await page.waitForXPath("//h3[contains(., 'Bug Reproduction Load')]", { timeout: 5000 });
        const [cardTitle] = await page.$x("//h3[contains(., 'Bug Reproduction Load')]");
        const card = await page.evaluateHandle(el => el.closest('.card'), cardTitle);

        // Click Edit
        const editBtn = await card.$('button.secondary-button');
        if (!editBtn) throw new Error("Edit button not found on card");
        await editBtn.click();
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
