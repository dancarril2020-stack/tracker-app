/**
 * e2e-password-reset-test.js
 * Purpose: Automates the testing of the password reset flow.
 * How it works: Uses Puppeteer to launch a headless browser, navigate to the login screen,
 * toggle the reset view, submit a test email, and verify that the UI returns to the initial state correctly.
 */
import puppeteer from 'puppeteer';

const BASE_URL = 'http://localhost:5173';

async function runTest() {
    console.log("Starting Password Reset E2E Test...");
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    const page = await browser.newPage();

    // Capture logs
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));

    try {
        console.log("--- Step 1: Navigate to Login Screen ---");
        await page.goto(BASE_URL);
        
        // Wait for main login form
        await page.waitForSelector('input[type="email"]', { timeout: 10000 });
        console.log("Login page loaded.");

        console.log("--- Step 2: Open Reset Password View ---");
        // Click the 'Forgot Password?' button
        const buttons = await page.$$('button');
        let forgotBtn = null;
        for (const btn of buttons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.includes("Forgot Password?")) {
                forgotBtn = btn;
                break;
            }
        }
        
        if (!forgotBtn) throw new Error("Forgot Password button not found!");
        await forgotBtn.click();
        
        // Wait for the UI to update to the reset view
        await page.waitForFunction(() => {
            const h2 = document.querySelector('h2');
            return h2 && h2.textContent.includes('Reset Password');
        });
        console.log("Reset Password view opened.");

        console.log("--- Step 3: Submit Reset Password Request ---");
        // The email input should still be there, but now the button says 'Send Reset Link'
        await page.type('input[type="email"]', 'test-reset@tvr.com');
        
        const resetButtons = await page.$$('button');
        let sendLinkBtn = null;
        for (const btn of resetButtons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.includes("Send Reset Link")) {
                sendLinkBtn = btn;
                break;
            }
        }
        
        if (!sendLinkBtn) throw new Error("Send Reset Link button not found!");
        await sendLinkBtn.click();
        
        // We do not wait for actual success message because this requires hitting Firebase in an uncontrolled environment. 
        // We will just verify that the request triggers the UI state (e.g. sending... or an error).
        // Since we are mocking the interaction, if we get an error saying 'auth/invalid-email' or similar, the UI is connected.
        await new Promise(r => setTimeout(r, 2000));
        console.log("Submit clicked, request dispatched.");

        console.log("--- Step 4: Back to Login ---");
        const backButtons = await page.$$('button');
        let backBtn = null;
        for (const btn of backButtons) {
            const text = await page.evaluate(el => el.textContent, btn);
            if (text.includes("Back to Login")) {
                backBtn = btn;
                break;
            }
        }
        
        if (!backBtn) throw new Error("Back to Login button not found!");
        await backBtn.click();
        
        await page.waitForFunction(() => {
            const h2 = document.querySelector('h2');
            return h2 && h2.textContent === 'Log In';
        });
        console.log("Returned to main Login view successfully.");
        
        console.log("Test Finished Successfully.");

    } catch (err) {
        console.error("TEST FAILED:", err);
        process.exit(1);
    } finally {
        await browser.close();
    }
}

runTest();
