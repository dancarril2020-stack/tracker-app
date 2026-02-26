/**
 * Migration Script: Add tenantId to Existing Records
 * 
 * Run this ONCE to tag all existing records with tenantId: 'default'.
 * This ensures the new security rules don't lock out existing data.
 * 
 * Usage:
 *   node migrate-tenant-ids.js
 * 
 * Requirements:
 *   npm install firebase-admin
 *   Download your service account key from Firebase Console > Project Settings > Service Accounts
 *   Save it as "service-account.json" in the same directory as this script.
 */

const admin = require('firebase-admin');
const serviceAccount = require('./service-account.json'); // <-- YOU MUST CREATE THIS

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function migrateCollection(collectionName, tenantId = 'default') {
    console.log(`\nMigrating "${collectionName}" collection...`);

    const snapshot = await db.collection(collectionName).get();
    const docs = snapshot.docs.filter(doc => !doc.data().tenantId); // Only docs missing tenantId

    console.log(`Found ${docs.length} documents to update.`);

    if (docs.length === 0) {
        console.log('Nothing to do.');
        return;
    }

    // Process in batches of 500 (Firestore limit)
    const batchSize = 500;
    for (let i = 0; i < docs.length; i += batchSize) {
        const batch = db.batch();
        const chunk = docs.slice(i, i + batchSize);

        chunk.forEach(doc => {
            batch.update(doc.ref, { tenantId });
        });

        await batch.commit();
        console.log(`  ✅ Updated batch ${Math.floor(i / batchSize) + 1} (${chunk.length} docs)`);
    }

    console.log(`Done. ${docs.length} documents updated in "${collectionName}".`);
}

async function main() {
    console.log('=== Tenant ID Migration Script ===');
    console.log('This will add tenantId: "default" to all existing records without one.');
    console.log('');

    try {
        await migrateCollection('records', 'default');
        await migrateCollection('debts', 'default');
        await migrateCollection('audit_logs', 'default');

        console.log('\n=== Migration Complete ===');
        console.log('All existing records now have tenantId: "default".');
        console.log('');
        console.log('Next steps:');
        console.log('1. Deploy security rules:  firebase deploy --only firestore:rules');
        console.log('2. Update existing users in Firestore to have tenantId: "default"');
        console.log('3. Create new users with their proper tenantId via the Users tab');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }

    process.exit(0);
}

main();
