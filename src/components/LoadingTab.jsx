import React, { useState } from 'react';
import { db, collection, addDoc, query, where, getDocs, updateDoc, doc, getUsers } from '../firebase';


import { useAuth } from '../contexts/AuthContext';

export default function LoadingTab({ onCompleteLoad }) {
    const { currentUser, userRole } = useAuth(); // Added userRole
    const [formData, setFormData] = useState({
        recipient: '',
        remittance: '',
        quantity: '',
        volumen: ''
    });
    const [loading, setLoading] = useState(false);

    // Driver Selection State (for Office/Backoffice)
    const [drivers, setDrivers] = useState([]);
    const [selectedDriver, setSelectedDriver] = useState('');

    React.useEffect(() => {
        async function fetchDrivers() {
            if (userRole === 'office' || userRole === 'backoffice') {
                const allUsers = await getUsers();
                const driverList = allUsers.filter(u => u.role === 'driver');
                setDrivers(driverList);
                if (driverList.length > 0) {
                    setSelectedDriver(driverList[0].uid);
                }
            } else {
                // If driver, always themselves
                setSelectedDriver(currentUser.uid);
            }
        }
        fetchDrivers();
    }, [userRole, currentUser]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.recipient || !formData.remittance) {
            alert("Error: Recipient and Remittance are mandatory.");
            return;
        }

        // Determine target driver
        let targetDriverId = currentUser.uid;
        let targetDriverName = currentUser.name || currentUser.email;

        // If office, use selected driver
        if ((userRole === 'office' || userRole === 'backoffice') && selectedDriver) {
            const driverObj = drivers.find(d => d.uid === selectedDriver);
            if (driverObj) {
                targetDriverId = driverObj.uid;
                targetDriverName = driverObj.name || driverObj.email;
            }
        }

        setLoading(true);
        try {
            const today = new Date().toISOString().split('T')[0];
            const recordsRef = collection(db, "records");

            // Check for existing pending load (Check against TARGET driver)
            const q = query(
                recordsRef,
                where("driverId", "==", targetDriverId),
                where("date", "==", today),
                where("type", "==", "load"),
                where("recipient", "==", formData.recipient.toLowerCase()),
                where("remittance", "==", formData.remittance.toLowerCase()),
                where("status", "==", "pending")
            );

            const querySnapshot = await getDocs(q);

            if (!querySnapshot.empty) {
                // UPDATE existing record
                const existingDoc = querySnapshot.docs[0];
                const existingData = existingDoc.data();
                const newQuantity = Number(existingData.quantity || 0) + Number(formData.quantity || 0);

                await updateDoc(doc(db, "records", existingDoc.id), {
                    quantity: newQuantity,
                    // Append volume info if provided, otherwise keep existing
                    volumen: formData.volumen ? `${existingData.volumen || ''} + ${formData.volumen}` : existingData.volumen
                });
                alert(`Existing Load Updated for ${targetDriverName} (Quantity Merged)`);
            } else {
                // CREATE new record
                await addDoc(collection(db, "records"), {
                    type: 'load',
                    driverId: targetDriverId,
                    driverName: targetDriverName,
                    ...formData,
                    status: 'pending',
                    createdAt: new Date().toISOString(),
                    date: today
                });
                alert(`Load Registered Successfully for ${targetDriverName}`);
            }

            setFormData({ recipient: '', remittance: '', quantity: '', volumen: '' });
        } catch (err) {
            console.error(err);
            alert("Error registering load");
        }
        setLoading(false);
    };

    return (
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h2>Register Load (Carga)</h2>
            <form onSubmit={handleSubmit}>

                {/* Driver Selector for Office */}
                {(userRole === 'office' || userRole === 'backoffice') && (
                    <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                        <label className="label">Assign to Driver</label>
                        <select
                            value={selectedDriver}
                            onChange={(e) => setSelectedDriver(e.target.value)}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                background: 'var(--input-bg)',
                                color: 'var(--text-main)',
                                fontSize: '1rem'
                            }}
                        >
                            {drivers.map(d => (
                                <option key={d.uid} value={d.uid}>
                                    {d.name || d.email}
                                </option>
                            ))}
                        </select>
                    </div>
                )}

                <div style={{ textAlign: 'left' }}>
                    <label className="label">Recipient Name *</label>
                    <input name="recipient" value={formData.recipient} onChange={handleChange} required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Remittance (Albarán) *</label>
                        <input name="remittance" value={formData.remittance} onChange={handleChange} required />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Quantity</label>
                        <input name="quantity" type="number" value={formData.quantity} onChange={handleChange} />
                    </div>
                </div>

                <div style={{ textAlign: 'left' }}>
                    <label className="label">Volumen/Missing/Damage</label>
                    <input name="volumen" value={formData.volumen} onChange={handleChange} placeholder="e.g. 2 pallets" />
                </div>

                <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                    <button type="submit" disabled={loading} style={{ flex: 1 }}>
                        {loading ? 'Saving...' : 'Register Load'}
                    </button>
                    <button
                        type="button"
                        disabled={loading}
                        onClick={onCompleteLoad}
                        style={{ flex: 1, background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-main)' }}
                    >
                        Complete Load
                    </button>
                </div>
            </form>
        </div>
    );
}
