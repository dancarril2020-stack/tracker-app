// MOCK FIREBASE implementation for testing without keys
console.warn("RUNNING IN MOCK MODE: Data will disappear on refresh.");

// Mock DB Storage
const mockDb = {
    users: {
        'driver1': { email: 'driver@tvr.com', role: 'driver', name: 'Mock Driver' },
        'office1': { email: 'office@tvr.com', role: 'office', name: 'Mock Office' },
        'backoffice1': { email: 'backoffice@tvr.com', role: 'backoffice', name: 'Mock Backoffice' }
    },
    records: [] // Array of record objects
};


const mockAuth = {
    currentUser: null,
    listeners: []
};

// --- Auth Mocks ---
export const auth = mockAuth;

export const signInWithEmailAndPassword = async (auth, email, password) => {
    // Check mockDb.users first for dynamic users
    // Find entry AND key
    const found = Object.entries(mockDb.users).find(([key, u]) => u.email === email);

    if (found) {
        const [key, userEntry] = found;
        auth.currentUser = { uid: key, ...userEntry };
    } else {
        // Fallback for legacy hardcoded checks (if any remain)
        if (email.includes('backoffice')) {
            auth.currentUser = { uid: 'backoffice1', email, role: 'backoffice' };
        } else if (email.includes('office')) {
            auth.currentUser = { uid: 'office1', email, role: 'office' };
        } else {
            auth.currentUser = { uid: 'driver1', email, role: 'driver' };
        }
    }

    // Notify listeners
    auth.listeners.forEach(cb => cb(auth.currentUser));

    return { user: auth.currentUser };
};

// --- User Management Helpers (Mock) ---
export const registerUser = (email, password, role, name) => {
    if (Object.values(mockDb.users).some(u => u.email === email)) {
        throw new Error("User already exists");
    }
    const id = 'user_' + Date.now();
    const newUser = { email, role, name, uid: id };
    mockDb.users[id] = newUser;
    return newUser;
};

export const getUsers = () => {
    return Object.values(mockDb.users);
};

export const signOut = async (auth) => {
    auth.currentUser = null;
    auth.listeners.forEach(cb => cb(null));
};

export const onAuthStateChanged = (auth, callback) => {
    // Trigger immediately
    callback(auth.currentUser);

    // Subscribe
    auth.listeners.push(callback);

    // Unsubscribe function
    return () => {
        auth.listeners = auth.listeners.filter(cb => cb !== callback);
    };
};

export const createUserWithEmailAndPassword = async (auth, email, password) => {
    return { user: { uid: 'new_user_' + Date.now(), email } };
};

// --- Firestore Mocks ---
export const db = {}; // dummy object

export const collection = (db, name) => name;
export const doc = (db, col, id) => ({ col, id });

export const getDoc = async (docRef) => {
    // Mock fetching user profile
    if (docRef.col === 'users') {
        const user = mockDb.users[docRef.id];
        return {
            exists: () => !!user,
            data: () => user
        };
    }
    return { exists: () => false };
};

export const setDoc = async (docRef, data) => {
    if (docRef.col === 'users') {
        mockDb.users[docRef.id] = data;
    }
};

export const addDoc = async (colName, data) => {
    // colName might be the object returned by collection(), which is just the string name in our mock
    const collectionName = typeof colName === 'object' ? colName.col || colName : colName;
    const newDoc = { id: 'rec_' + Date.now(), ...data, _collection: collectionName };
    mockDb.records.push(newDoc);
    return newDoc;
};

export const updateDoc = async (docRef, data) => {
    const record = mockDb.records.find(r => r.id === docRef.id);
    if (record) {
        Object.assign(record, data);
    }
};

export const deleteDoc = async (docRef) => {
    const index = mockDb.records.findIndex(r => r.id === docRef.id);
    if (index !== -1) {
        mockDb.records.splice(index, 1);
    }
};

// Mock Query Functions
export const query = (col, ...constraints) => {
    // col is what collection() returns. In our mock: name string
    return { col, constraints };
};

export const where = (field, op, val) => ({ type: 'where', field, op, val });
export const orderBy = (field, dir) => ({ type: 'orderBy', field, dir });

export const limit = (num) => ({ type: 'limit', num });

export const getDocs = async (q) => {
    let results = [...mockDb.records];

    // Filter by Collection if q.col is defined
    if (q.col) {
        const collectionName = typeof q.col === 'object' ? q.col.col || q.col : q.col;
        results = results.filter(r => r._collection === collectionName);
    }

    if (q.constraints) {
        q.constraints.forEach(c => {
            if (c.type === 'where') {
                results = results.filter(r => r[c.field] === c.val);
            }
            if (c.type === 'orderBy') {
                results.sort((a, b) => {
                    if (a[c.field] < b[c.field]) return c.dir === 'desc' ? 1 : -1;
                    if (a[c.field] > b[c.field]) return c.dir === 'desc' ? -1 : 1;
                    return 0;
                });
            }
        });

        // Apply limit last
        const limitConstraint = q.constraints.find(c => c.type === 'limit');
        if (limitConstraint) {
            results = results.slice(0, limitConstraint.num);
        }
    }

    return {
        docs: results.map(r => ({
            id: r.id,
            data: () => r
        })),
        empty: results.length === 0,
        forEach: (cb) => results.forEach((r, i) => cb({ id: r.id, data: () => r }))
    };
};

export const arrayUnion = (item) => item;

export const Timestamp = {
    now: () => ({ toDate: () => new Date(), toMillis: () => Date.now() }),
    fromDate: (date) => ({ toDate: () => date, toMillis: () => date.getTime() })
};

export default {};
