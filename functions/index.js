const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();

exports.generateSequentialInvoice = onDocumentCreated("records/{recordId}", async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const data = snapshot.data();

    // Only generate an invoice if this is a supplier pickup request
    if (data.type !== 'pickup') {
        return;
    }

    // Determine Prefix (Supplier Name or TenantId, fallback to INV)
    let prefix = 'INV';
    if (data.tenantId && data.tenantId !== 'default') {
        prefix = data.tenantId.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 4);
    } else if (data.supplierName) {
        prefix = data.supplierName.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 4);
    }

    const tenantIdToUse = data.supplierId || 'default'; // Use supplier's user ID as the tenant context for counters
    const counterRef = db.doc(`tenants/${tenantIdToUse}/metadata/counters`);
    
    const year = new Date().getFullYear();

    try {
        await db.runTransaction(async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            
            let newSequence = 1000;
            if (counterDoc.exists && counterDoc.data().invoice_sequence !== undefined) {
                newSequence = counterDoc.data().invoice_sequence + 1;
            }

            // Save new sequence
            transaction.set(counterRef, { invoice_sequence: newSequence }, { merge: true });

            // Update the newly created record with the invoice number
            const invoiceNumber = `${prefix}-${year}-${newSequence}`;
            const recordRef = db.doc(`records/${event.params.recordId}`);
            
            transaction.update(recordRef, { invoiceNumber: invoiceNumber });
            
            console.log(`Generated Invoice Number ${invoiceNumber} for Record ${event.params.recordId}`);
        });
    } catch (error) {
        console.error("Transaction failed during invoice generation: ", error);
    }
});
