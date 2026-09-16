import { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import { supabase } from '../supabase';
import { logAction, ACTIONS } from '../utils/audit'; // Import audit

import { useAuth } from '../contexts/AuthContext';

import { RecordItem } from '../types';

export default function EditModal({ record, onClose, onUpdate }: { record: RecordItem, onClose: () => void, onUpdate: () => void }) {
    const { currentUser } = useAuth();
    const [formData, setFormData] = useState({ ...record });
    const [loading, setLoading] = useState(false);

    // Lock body scroll when modal is open and ensure it's visible
    useEffect(() => {
        // Prevent body scroll
        const originalOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        return () => {
            document.body.style.overflow = originalOverflow;
        };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        // Basic validation for numeric fields
        if ((name === 'reembolso' || name === 'collectedValue') && !/^[0-9,.]*$/.test(value)) return;

        setFormData(prev => {
            const newData = { ...prev, [name]: value } as typeof prev;

            // Auto-sync: If user edits 'reembolso' and 'collectedValue' was same as 'reembolso', update 'collectedValue' too.
            // This handles the case where Office edits a standard delivery price and expects the "Total" (collected) to update.
            if (name === 'reembolso') {
                const currentCollected = prev.collectedValue || '';
                const currentExpected = prev.reembolso || '';
                // If they matched (or collected was empty? optional), keep them in sync
                if (currentCollected === currentExpected) {
                    newData.collectedValue = value;
                }
            }
            return newData;
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        try {
            // --- DIFF LOGIC FOR AUDIT ---
            const fieldsToTrack = {
                recipient: 'Recipient',
                remittance: 'Remittance',
                quantity: 'Quantity',
                reembolso: 'Expected Reembolso',
                collectedValue: 'Actually Collected',
                address: 'Address',
                observations: 'Observations',
                session: 'Session'
            };

            const changes: string[] = [];
            Object.keys(fieldsToTrack).forEach(key => {
                const k = key as keyof typeof fieldsToTrack;
                const oldVal = ((record as any)[k] || '').toString().trim();
                const newVal = ((formData as any)[k] || '').toString().trim();

                if (oldVal !== newVal) {
                    changes.push(`${fieldsToTrack[k]}: ${oldVal || '(empty)'} → ${newVal || '(empty)'}`);
                }
            });

            const diffSummary = changes.length > 0 ? `\nChanges:\n• ${changes.join('\n• ')}` : ' (No data changed)';

            // Create Audit Entry (Internal to doc)
            const changeLog = {
                modifiedAt: new Date().toISOString(),
                modifiedBy: currentUser?.email || 'unknown',
                changes: changes, // Optional: add the detailed transitions here too
                previousState: {
                    recipient: record.recipient || '',
                    quantity: record.quantity || 0,
                    remittance: record.remittance || '',
                    status: record.status || 'unknown',
                    session: record.session || 'morning',
                    address: record.address || '',
                    observations: record.observations || '',
                    collectedValue: record.collectedValue || ''
                }
            };

            // Update Document
            const existingHistory = Array.isArray(record.auditHistory) ? record.auditHistory : [];
            const newHistory = [...existingHistory, changeLog];

            const { error: updateError } = await supabase.from('records').update({
                recipient: formData.recipient || '',
                remittance: formData.remittance || '',
                quantity: formData.quantity || 0,
                volumen: formData.volumen || '',
                reembolso: formData.reembolso || '',
                session: formData.session || 'morning',
                address: formData.address || '',
                observations: formData.observations || '',
                collectedValue: formData.collectedValue || '',
                auditHistory: newHistory
            }).eq('id', record.id);
            if (updateError) throw updateError;

            // LOG AUDIT (Detailed)
            const actionType = record.type === 'load' ? ACTIONS.EDIT_LOAD : ACTIONS.EDIT_DELIVERY;
            await logAction(
                currentUser,
                actionType,
                `Edited ${record.type} record for ${formData.recipient}${diffSummary}`,
                record.id
            );

            // --- CASCADE UPDATES FOR LOGIC CONSISTENCY ---
            const newQty = Number(formData.quantity || 0);

            // Case A: Editing a DELIVERY -> Update the linked LOAD
            if (record.type === 'delivery') {
                const identifiersChanged = record.remittance !== formData.remittance || record.recipient !== formData.recipient;

                const updateLoadCascade = async (remittance: string | undefined, recipient: string | undefined) => {
                    const { data: loads } = await supabase.from('records')
                        .select('*')
                        .eq('type', 'load')
                        .eq('remittance', remittance)
                        .eq('recipient', recipient)
                        .eq('driverId', record.driverId);

                    for (const loadData of loads || []) {
                        const { data: deliveries } = await supabase.from('records')
                            .select('*')
                            .eq('type', 'delivery')
                            .eq('remittance', remittance)
                            .eq('recipient', recipient);

                        let totalDelivered = 0;
                        (deliveries || []).forEach(d => {
                            const qty = (d.id === record.id) ? Number(formData.quantity || 0) : Number(d.quantity || 0);
                            totalDelivered += qty;
                        });

                        const loadQty = Number(loadData.quantity || 0);
                        let newStatus = 'delivered';
                        if (totalDelivered === 0) {
                            newStatus = (loadData.status === 'assigned_load') ? 'assigned_load' : 'pending';
                        }
                        else if (totalDelivered < loadQty) newStatus = 'incident_missing';
                        else if (totalDelivered > loadQty) newStatus = 'incident_excess';

                        await supabase.from('records').update({
                            deliveredQuantity: totalDelivered,
                            status: newStatus
                        }).eq('id', loadData.id);
                    }
                };

                // Update New (or current) loads
                await updateLoadCascade(formData.remittance, formData.recipient);

                // If changed, also cleanup Old loads
                if (identifiersChanged) {
                    await updateLoadCascade(record.remittance, record.recipient);
                }
            }

            // Case B: Editing a LOAD -> Update ITSELF based on existing deliveries
            if (record.type === 'load') {
                const { data: deliveries } = await supabase.from('records')
                    .select('*')
                    .eq('remittance', formData.remittance)
                    .eq('recipient', formData.recipient)
                    .eq('type', 'delivery')
                    .eq('driverId', record.driverId)
                    .eq('date', record.date);

                let totalDelivered = 0;
                (deliveries || []).forEach(d => totalDelivered += Number(d.quantity || 0));

                let newStatus = 'delivered';
                // Note: newQty here is the NEW load quantity we just typed
                if (totalDelivered === 0) {
                    // Fix: If it was 'assigned_load' (waiting), keep it. Don't flip to 'pending' (loaded) unless explicit action taken elsewhere.
                    newStatus = (record.status === 'assigned_load') ? 'assigned_load' : 'pending';
                }
                else if (totalDelivered < newQty) newStatus = 'incident_missing';
                else if (totalDelivered > newQty) newStatus = 'incident_excess';

                // Update the load's own status/deliveredQty (since we already updated other fields above)
                await supabase.from('records').update({
                    status: newStatus,
                    deliveredQuantity: totalDelivered
                }).eq('id', record.id);
            }


            alert("Record updated successfully.");
            onUpdate(); // Trigger refresh in parent
            onClose();
        } catch (err: any) {
            console.error(err);
            alert("Failed to update record: " + err.message);
        }
        setLoading(false);
    };

    return ReactDOM.createPortal(
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 1000, backdropFilter: 'blur(3px)',
            padding: '10px'
        }}>
            <div className="glass-panel" style={{
                width: '95%',
                maxWidth: '600px',
                background: '#18181b',
                padding: '1.2rem',
                border: '1px solid var(--border)'
            }}>
                <h3 style={{ marginTop: 0, marginBottom: '1rem', fontSize: '1.1rem' }}>Edit Record</h3>
                <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.8rem' }}>

                    <div style={{ gridColumn: 'span 2' }}>
                        <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Recipient</label>
                        <input name="recipient" value={formData.recipient} onChange={handleChange} style={{ padding: '0.5rem' }} />
                    </div>

                    <div>
                        <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Remittance</label>
                        <input name="remittance" value={formData.remittance} onChange={handleChange} style={{ padding: '0.5rem' }} />
                    </div>
                    <div>
                        <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Quantity</label>
                        <input name="quantity" value={formData.quantity} onChange={handleChange} style={{ padding: '0.5rem' }} />
                    </div>

                    <div>
                        <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Volumen / Notes</label>
                        <input
                            name="volumen"
                            value={formData.volumen || ''}
                            onChange={handleChange}
                            style={{ padding: '0.5rem' }}
                        />
                    </div>
                    <div>
                        <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Address / Location</label>
                        <input
                            name="address"
                            value={formData.address || ''}
                            onChange={handleChange}
                            style={{ padding: '0.5rem' }}
                        />
                    </div>

                    <div style={{ gridColumn: 'span 2' }}>
                        <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Driver Observations</label>
                        <input
                            name="observations"
                            value={formData.observations || ''}
                            onChange={handleChange}
                            style={{ padding: '0.5rem' }}
                        />
                    </div>

                    {(record.type === 'delivery' || record.type === 'pickup' || record.type === 'load') && (
                        <>
                            <div>
                                <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Expected Reembolso</label>
                                <input
                                    name="reembolso"
                                    value={formData.reembolso || ''}
                                    onChange={handleChange}
                                    style={{ padding: '0.5rem' }}
                                />
                            </div>
                            <div>
                                <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Actually Collected</label>
                                <input
                                    name="collectedValue"
                                    value={formData.collectedValue || ''}
                                    onChange={handleChange}
                                    style={{ padding: '0.5rem' }}
                                />
                            </div>
                        </>
                    )}

                    <div style={{ gridColumn: 'span 2' }}>
                        <label className="label" style={{ fontSize: '0.75rem', marginBottom: '0.2rem' }}>Session</label>
                        <select
                            name="session"
                            value={formData.session || 'morning'}
                            onChange={handleChange}
                            style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--input-bg)', color: 'var(--text-main)' }}
                        >
                            <option value="morning">🌅 Morning</option>
                            <option value="afternoon">🌇 Afternoon</option>
                        </select>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', gridColumn: 'span 2' }}>
                        <button type="button" onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid var(--border)', padding: '0.6rem' }}>
                            Cancel
                        </button>
                        <button type="submit" disabled={loading} style={{ flex: 1, padding: '0.6rem' }}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
