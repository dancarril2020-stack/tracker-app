import React, { useState } from 'react';
import { db, collection, addDoc } from '../firebase';

import { useAuth } from '../contexts/AuthContext';

export default function PickupTab() {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState({
        recipient: '',
        remittance: '',
        quantity: '',
        volumen: '',
        portes: 'paid', // 'paid' (Pagados) or 'due' (Debidos)
        reembolso: ''
    });
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;

        // Numeric validation for Reembolso
        if (name === 'reembolso') {
            if (!/^[0-9,]*$/.test(value)) return;
        }

        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.recipient || !formData.remittance) {
            alert("Error: Recipient and Remittance are mandatory.");
            return;
        }

        setLoading(true);
        try {
            await addDoc(collection(db, "records"), {
                type: 'pickup', // Recogida
                driverId: currentUser.uid,
                driverName: currentUser.name || currentUser.email,
                ...formData,
                createdAt: new Date().toISOString(),
                date: new Date().toISOString().split('T')[0]
            });
            alert("Pickup Registered Successfully");
            setFormData({ recipient: '', remittance: '', quantity: '', volumen: '', portes: 'paid', reembolso: '' });
        } catch (err) {
            console.error(err);
            alert("Error registering pickup");
        }
        setLoading(false);
    };

    return (
        <div className="glass-panel animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h2>Register Pick-up (Recogida)</h2>
            <form onSubmit={handleSubmit}>
                <div style={{ textAlign: 'left' }}>
                    <label className="label">Recipient Name *</label>
                    <input name="recipient" value={formData.recipient} onChange={handleChange} required />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Remittance *</label>
                        <input name="remittance" value={formData.remittance} onChange={handleChange} required />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Quantity</label>
                        <input name="quantity" type="number" value={formData.quantity} onChange={handleChange} />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Reembolso (Optional)</label>
                        <input
                            name="reembolso"
                            value={formData.reembolso}
                            onChange={handleChange}
                            placeholder="e.g. 50,00"
                        />
                    </div>
                    <div style={{ textAlign: 'left' }}>
                        <label className="label">Volumen/Missing/Damage</label>
                        <input name="volumen" value={formData.volumen} onChange={handleChange} />
                    </div>
                </div>

                <div style={{ textAlign: 'left', marginBottom: '1rem' }}>
                    <label className="label">Portes</label>
                    <select name="portes" value={formData.portes} onChange={handleChange}>
                        <option value="paid">Paid (Pagados)</option>
                        <option value="due">Due (Debidos)</option>
                    </select>
                </div>

                <button type="submit" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
                    {loading ? 'Saving...' : 'Register Pick-up'}
                </button>
            </form>
        </div>
    );
}
