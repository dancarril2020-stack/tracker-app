import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

const firebaseConfig = {
    apiKey: "AIzaSyCK-3TyqOg6PrgNl12Hx5j10zud6rgBEv4",
    authDomain: "tracker-app-testenvironment.firebaseapp.com",
    projectId: "tracker-app-testenvironment",
    storageBucket: "tracker-app-testenvironment.firebasestorage.app",
    messagingSenderId: "761087982112",
    appId: "1:761087982112:web:9780290aaf1a92b5889a45"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const MOCK_RECIPIENTS = [
    { id: '1', name: 'Client A', address: '123 Main St', zipCode: '115520', phone: '555-0101', hasBankAccount: true },
    { id: '2', name: 'Client B', address: '456 Oak Ave', zipCode: '102200', phone: '555-0102', hasBankAccount: false },
    { id: '3', name: 'General Store', address: '789 Pine Rd', zipCode: '200100', phone: '555-0103', hasBankAccount: true },
];

const MOCK_PRODUCTS = [
    { id: 'p1', name: 'Box Small', weightObs: '2kg - 20x20x20' },
    { id: 'p2', name: 'Box Medium', weightObs: '5kg - 40x40x40' },
    { id: 'p3', name: 'Box Large', weightObs: '10kg - 60x60x60' },
    { id: 'p4', name: 'Pallet Euro', weightObs: '500kg - 120x80' },
];

const ZIP_PORTES_MAP = {
    '115520': 4.40,
    '102200': 3.50,
    '200100': 5.25,
};

async function seed() {
    console.log("\nSeeding Recipients...");
    for (const r of MOCK_RECIPIENTS) {
        await setDoc(doc(db, "recipients", r.id), r);
        console.log(`- Created recipient: ${r.name}`);
    }

    console.log("\nSeeding Products...");
    for (const p of MOCK_PRODUCTS) {
        await setDoc(doc(db, "products", p.id), p);
        console.log(`- Created product: ${p.name}`);
    }

    console.log("\nSeeding Zip Code Portes...");
    for (const [zip, price] of Object.entries(ZIP_PORTES_MAP)) {
        await setDoc(doc(db, "zip_portes", zip), { zipCode: zip, price: price });
        console.log(`- Created port for zip: ${zip} -> ${price}`);
    }

    console.log("\nSeeding complete!");
    process.exit(0);
}

seed().catch(err => {
    console.error("Error seeding data:", err);
    process.exit(1);
});
