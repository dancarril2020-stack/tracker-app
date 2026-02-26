import puppeteer from 'puppeteer';
import fs from 'fs';

const BASE_URL = 'http://localhost:5173';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function runTest() {
    const browser = await puppeteer.launch({ protocolTimeout: 120000,
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Capture console logs
    page.on('console', msg => {
        const text = msg.text();
        console.log(`[BROWSER] ${text}`);
        fs.appendFileSync('browser_logs.txt', `${text}\n`);
    });

    try {
        console.log("Starting Full Workflow Test (v11)...");
        if (fs.existsSync('browser_logs.txt')) fs.unlinkSync('browser_logs.txt');

        // --- STEP 1: LOGIN AS OFFICE ---
        console.log("--- Step 1: Login as Office ---");
        await page.goto(BASE_URL);
        await page.waitForSelector('input[type="email"]');
        await page.type('input[type="email"]', 'office_v11@tvr.com');
        await page.type('input[type="password"]', 'password');
        await page.click('button[type="submit"]');
        await page.waitForSelector('.tabs');
        console.log("Logged in as Office.");

        // Select Session: Morning
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const sessionLabel = labels.find(l => l.textContent.includes('Session'));
            if (sessionLabel) {
                const select = sessionLabel.parentElement.querySelector('select');
                if (select) {
                    select.value = 'morning';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
        await sleep(1000);

        // --- STEP 2: ASSIGN LOAD ---
        console.log("--- Step 2: Assign Load ---");
        await clickTab(page, 'Loads');

        // Select Driver: Driver V11
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const driverLabel = labels.find(l => l.textContent.includes('Driver'));
            if (driverLabel) {
                const select = driverLabel.parentElement.querySelector('select');
                if (select) {
                    const options = Array.from(select.options);
                    const target = options.find(o => o.textContent.includes('Driver V11'));
                    if (target) {
                        select.value = target.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        console.error("COULD NOT FIND DRIVER V11 IN SELECT. Options:", options.map(o => o.textContent));
                    }
                }
            }
        });

        await page.waitForSelector('input[name="recipient"]');
        await page.type('input[name="recipient"]', 'E2E-L-V11');
        await page.type('input[name="remittance"]', 'REM-V11');
        await page.type('input[name="quantity"]', '10');
        await page.type('input[name="reembolso"]', '100');
        await page.click('button[type="submit"]');
        console.log("Load Assigned.");
        await sleep(2000);

        // --- STEP 3: ASSIGN PICKUP ---
        console.log("--- Step 3: Assign Pickup ---");
        await clickTab(page, 'Pick-ups');

        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const sessionLabel = labels.find(l => l.textContent.includes('Session'));
            if (sessionLabel) {
                const select = sessionLabel.parentElement.querySelector('select');
                if (select) {
                    select.value = 'morning';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });

        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const driverLabel = labels.find(l => l.textContent.includes('Driver'));
            if (driverLabel) {
                const select = driverLabel.parentElement.querySelector('select');
                if (select) {
                    const options = Array.from(select.options);
                    const target = options.find(o => o.textContent.includes('Driver V11'));
                    if (target) {
                        select.value = target.value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    }
                }
            }
        });

        await page.waitForSelector('input[name="recipient"]');
        await page.type('input[name="recipient"]', 'E2E-P-V11');
        await page.type('input[name="remittance"]', 'PICK-V11');
        await page.type('input[name="quantity"]', '5');
        await page.type('input[name="reembolso"]', '50');
        await page.click('button[type="submit"]');
        console.log("Pickup Assigned.");
        await sleep(2000);

        // --- STEP 4: LOGOUT ---
        await logout(page);
        console.log("Logged out as Office.");

        // --- STEP 5: LOGIN AS DRIVER ---
        console.log("--- Step 5: Login as Driver ---");
        await page.waitForSelector('input[type="email"]');
        await page.type('input[type="email"]', 'driver_v11@tvr.com');
        await page.type('input[type="password"]', 'password');
        await page.click('button[type="submit"]');
        await page.waitForSelector('.tabs');
        console.log("Logged in as Driver.");

        // Ensure Morning session
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const sessionLabel = labels.find(l => l.textContent.includes('Session'));
            if (sessionLabel) {
                const select = sessionLabel.parentElement.querySelector('select');
                if (select) {
                    select.value = 'morning';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
        await sleep(2000);

        // --- STEP 6: DRIVER LOADS ITEMS ---
        console.log("--- Step 6: Driver Loads Items ---");
        await clickTab(page, 'Loads');

        try {
            await page.waitForFunction(() => {
                const inner = document.body.innerText;
                return inner.includes('REM-V11') || inner.includes('E2E-L-V11');
            }, { timeout: 20000 });
        } catch (e) {
            const content = await page.evaluate(() => document.body.innerHTML);
            fs.writeFileSync('error_dump.html', content);
            throw new Error("Could not find REM-V11 card. HTML dumped to error_dump.html");
        }

        // Set up dialog handler
        page.on('dialog', async dialog => {
            if (dialog.message().includes('Confirm loading')) {
                await dialog.accept();
            }
        });

        await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.card'));
            const targetCard = cards.find(c => c.textContent.includes('REM-V11'));
            const loadBtn = Array.from(targetCard.querySelectorAll('button')).find(b => b.textContent.includes('LOAD'));
            if (loadBtn) loadBtn.click();
        });
        await sleep(2000);

        // Switch to Loaded view
        await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const loadedBtn = btns.find(b => b.textContent.includes('On Truck'));
            if (loadedBtn) loadedBtn.click();
        });
        console.log("Items marked as Loaded.");
        await sleep(1500);

        // --- STEP 7: COMPLETE PICKUP ---
        console.log("--- Step 7: Complete Pickup ---");
        await clickTab(page, 'Pick-ups');
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const sessionLabel = labels.find(l => l.textContent.includes('Session'));
            if (sessionLabel) {
                const select = sessionLabel.parentElement.querySelector('select');
                if (select) {
                    select.value = 'morning';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
        await sleep(1500);

        await page.waitForFunction(() => {
            return Array.from(document.querySelectorAll('.card')).some(c => c.textContent.includes('PICK-V11'));
        });

        const pickupPromptPromise = new Promise(resolve => {
            page.once('dialog', async dialog => {
                if (dialog.type() === 'prompt') {
                    await dialog.accept('50');
                } else {
                    await dialog.accept();
                }
                resolve();
            });
        });

        await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.card'));
            const targetCard = cards.find(c => c.textContent.includes('PICK-V11'));
            const completeBtn = targetCard.querySelector('button');
            if (completeBtn) completeBtn.click();
        });
        await pickupPromptPromise;
        console.log("Pickup Completed.");
        await sleep(2000);

        // --- STEP 8: COMPLETE DELIVERY ---
        console.log("--- Step 8: Complete Delivery ---");
        await clickTab(page, 'Deliveries');
        await page.evaluate(() => {
            const labels = Array.from(document.querySelectorAll('label'));
            const sessionLabel = labels.find(l => l.textContent.includes('Session'));
            if (sessionLabel) {
                const select = sessionLabel.parentElement.querySelector('select');
                if (select) {
                    select.value = 'morning';
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
        await sleep(1500);

        await page.waitForFunction(() => {
            const inner = document.body.innerText;
            return inner.includes('REM-V11') || inner.includes('E2E-L-V11');
        });

        const deliveryPromptPromise = new Promise(resolve => {
            page.once('dialog', async dialog => {
                if (dialog.type() === 'prompt') {
                    await dialog.accept('100');
                } else {
                    await dialog.accept();
                }
                resolve();
            });
        });

        await page.evaluate(() => {
            const cards = Array.from(document.querySelectorAll('.card'));
            const targetCard = cards.find(c => c.textContent.includes('REM-V11'));
            const deliverBtn = Array.from(targetCard.querySelectorAll('button')).find(b => b.textContent.includes('Deliver'));
            if (deliverBtn) deliverBtn.click();
        });
        await deliveryPromptPromise;
        console.log("Delivery Completed.");
        await sleep(2000);

        // --- STEP 9: VERIFY AUDIT LOGS ---
        console.log("--- Step 9: Verify Audit Logs ---");
        await logout(page);
        await page.type('input[type="email"]', 'office_v11@tvr.com');
        await page.type('input[type="password"]', 'password');
        await page.click('button[type="submit"]');
        await page.waitForSelector('.tabs');

        await clickTab(page, 'Audit Logs');
        await page.waitForSelector('table');

        const logActions = await page.evaluate(() => {
            const rows = Array.from(document.querySelectorAll('tbody tr'));
            return rows.map(r => r.cells[2].textContent.trim());
        });

        console.log("Audit Logs found:", logActions.slice(0, 10));

        const requiredLogs = [
            'Load Item',
            'Create Item',
            'Update',
            'Pick-up Item',
            'Deliver Item'
        ];

        let missingCount = 0;
        for (const action of requiredLogs) {
            const found = logActions.some(l => l.includes(action));
            if (found) {
                console.log(`✅ Verified Log: ${action}`);
            } else {
                console.error(`❌ Missing Log: ${action}`);
                missingCount++;
            }
        }

        if (missingCount === 0) {
            console.log("--- TEST SUCCESSFUL ---");
            process.exit(0);
        } else {
            console.error(`--- TEST FAILED: ${missingCount} logs missing ---`);
            process.exit(1);
        }

    } catch (err) {
        console.error("TEST FAILED:", err);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

async function clickTab(page, tabText) {
    await page.evaluate((text) => {
        const btns = Array.from(document.querySelectorAll('.tab-button'));
        const btn = btns.find(b => b.textContent.trim().includes(text));
        if (btn) btn.click();
    }, tabText);
    await sleep(1500);
}

async function logout(page) {
    await sleep(1000);
    const buttons = await page.$$('header button');
    let logoutBtn;
    for (const btn of buttons) {
        const text = await page.evaluate(el => el.textContent, btn);
        if (text.includes("Log Out")) {
            logoutBtn = btn;
            break;
        }
    }
    if (logoutBtn) await logoutBtn.click();
    await sleep(2000);
}

runTest();
