import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";

const firebaseConfig = {
    apiKey: "AIzaSyCK-3TyqOg6PrgNl12Hx5j10zud6rgBEv4",
    authDomain: "tracker-app-testenvironment.firebaseapp.com",
    projectId: "tracker-app-testenvironment",
    storageBucket: "tracker-app-testenvironment.firebasestorage.app",
    messagingSenderId: "761087982112",
    appId: "1:761087982112:web:9780290aaf1a92b5889a45"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const usersToCreate = [
    { email: "office@tvr.com", password: "password", role: "office", name: "Office Admin" },
    { email: "danielcarril@tvr.com", password: "password123", role: "driver", name: "Daniel Carril" }
];

async function seed() {
    for (const u of usersToCreate) {
        console.log(`Creating user: ${u.email}...`);
        try {
            const userCredential = await createUserWithEmailAndPassword(auth, u.email, u.password);
            const user = userCredential.user;

            await setDoc(doc(db, "users", user.uid), {
                name: u.name,
                email: u.email,
                role: u.role,
                createdAt: new Date().toISOString()
            });
            console.log(`Success for ${u.email}`);
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') {
                console.log(`User ${u.email} already exists.`);
            } else {
                console.error(`Error for ${u.email}:`, err.message);
            }
        }
    }
    process.exit(0);
}

seed();
