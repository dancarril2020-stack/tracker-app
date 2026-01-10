import React, { useState } from 'react';
import { db, doc, updateDoc, arrayUnion, query, collection, where, getDocs } from '../firebase';
import { logAction, ACTIONS } from '../utils/audit'; // Import audit

import { useAuth } from '../contexts/AuthContext';

export default function EditModal({ record, onClose, onUpdate }) {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState({ ...record });
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        // Basic validation similar to other forms
        if (name === 'reembolso' && !/^[0-9,]*$/.test(value)) return;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            const recordRef = doc(db, "records", record.id);

            // Create Audit Entry (Internal to doc)
            const changeLog = {
                modifiedAt: new Date().toISOString(),
                modifiedBy: currentUser.email,
                previousState: {
                    recipient: record.recipient,
                    quantity: record.quantity,
                    remittance: record.remittance,
                    status: record.status
                }
            };

            // Update Document
            await updateDoc(recordRef, {
                recipient: formData.recipient,
                remittance: formData.remittance,
                quantity: formData.quantity,
                volumen: formData.volumen || '',
                reembolso: formData.reembolso || '',
                auditHistory: arrayUnion(changeLog)
            });

            // LOG AUDIT (Centralized)
            const actionType = record.type === 'load' ? ACTIONS.EDIT_LOAD : ACTIONS.EDIT_DELIVERY;
            await logAction(currentUser, actionType, `Edited ${record.type} record for ${formData.recipient}`, record.id);

            // --- CASCADE UPDATES FOR LOGIC CONSISTENCY ---
            const newQty = Number(formData.quantity || 0);

            // Case A: Editing a DELIVERY -> Update the linked LOAD
            if (record.type === 'delivery') {
                const q = query(
                    collection(db, "records"),
                    where("remittance", "==", formData.remittance),
                    where("recipient", "==", formData.recipient),
                    where("type", "==", "load")
                );
                const querySnapshot = await getDocs(q);

                for (const loadDoc of querySnapshot.docs) {
                    const loadData = loadDoc.data();

                    // Re-calculate TOTAL delivered for this load from scratch to be safe
                    // We need to fetch ALL deliveries for this load to sum them up correctly
                    const deliveriesQ = query(
                        collection(db, "records"),
                        where("remittance", "==", formData.remittance),
                        where("recipient", "==", formData.recipient),
                        where("type", "==", "delivery")
                    );
                    const deliveriesSnap = await getDocs(deliveriesQ);

                    // Sum all deliveries (Use the NEW value for the one we just edited)
                    let totalDelivered = 0;
                    deliveriesSnap.forEach(d => {
                        if (d.id === record.id) {
                            totalDelivered += newQty; // Use the new value we just saved
                        } else {
                            totalDelivered += Number(d.data().quantity || 0);
                        }
                    });

                    const loadQty = Number(loadData.quantity || 0);
                    let newStatus = 'delivered';
                    if (totalDelivered < loadQty) newStatus = 'incident_missing';
                    else if (totalDelivered > loadQty) newStatus = 'incident_excess';

                    await updateDoc(doc(db, "records", loadDoc.id), {
                        status: newStatus,
                        deliveredQuantity: totalDelivered
                    });
                }
            }

            // Case B: Editing a LOAD -> Update ITSELF based on existing deliveries
            if (record.type === 'load') {
                const deliveriesQ = query(
                    collection(db, "records"),
                    where("remittance", "==", formData.remittance),
                    where("recipient", "==", formData.recipient),
                    where("type", "==", "delivery")
                );
                const deliveriesSnap = await getDocs(deliveriesQ);
                let totalDelivered = 0;
                deliveriesSnap.forEach(d => totalDelivered += Number(d.data().quantity || 0));

                let newStatus = 'delivered';
                // Note: newQty here is the NEW load quantity we just typed
                if (totalDelivered === 0) newStatus = 'pending';
                else if (totalDelivered < newQty) newStatus = 'incident_missing';
                else if (totalDelivered > newQty) newStatus = 'incident_excess';

                // Update the load's own status/deliveredQty (since we already updated other fields above)
                await updateDoc(recordRef, {
                    status: newStatus,
                    deliveredQuantity: totalDelivered
                });
            }


            alert("Record updated successfully.");
            onUpdate(); // Trigger refresh in parent
            onClose();
        } catch (err) {
            console.error(err);
            alert("Failed to update record.");
        }
        setLoading(false);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(5px)'
        }}>
            <div className="glass-panel" style={{ width: '90%', maxWidth: '500px', background: '#18181b' }}>
                <h3>Edit Record</h3>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label className="label">Recipient</label>
                        <input name="recipient" value={formData.recipient} onChange={handleChange} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label className="label">Remittance</label>
                            <input name="remittance" value={formData.remittance} onChange={handleChange} />
                        </div>
                        <div>
                            <label className="label">Quantity</label>
                            <input name="quantity" value={formData.quantity} onChange={handleChange} />
                        </div>
                    </div>

                    {(record.type === 'delivery' || record.type === 'pickup' || record.type === 'load') && (
                        <div style={{ marginTop: '1rem' }}>
                            <label className="label">Portes/Reembolso</label>
                            <input
                                name="reembolso"
                                value={formData.reembolso}
                                onChange={handleChange}
                                placeholder="e.g. 50,00"
                            />
                        </div>
                    )}

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)' }}>
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} style={{ flex: 1 }}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
