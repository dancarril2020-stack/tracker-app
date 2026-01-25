import React, { useState, useEffect } from 'react';
import { db, collection, query, where, getDocs, updateDoc, doc, onSnapshot } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { logAction, ACTIONS } from '../utils/audit';

export default function DebtsTab() {
    const { currentUser, userRole } = useAuth();
    const [debts, setDebts] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch Debts (Real-time)
    useEffect(() => {
        setLoading(true);
        // Office sees ALL bets. Backoffice sees ALL. 
        // Drivers? Usually don't settle debts, but maybe want to see them?
        // Proposal: Drivers see THEIR debts. Office sees ALL.

        let q;
        const debtsRef = collection(db, "debts");

        if (userRole === 'office' || userRole === 'backoffice') {
            // Fetch all pending debts
            // Optionally we can fetch Paid history too, but let's stick to Pending for now for clarity
            q = query(debtsRef);
        } else {
            // Driver sees their caused debts
            q = query(debtsRef, where("driverId", "==", currentUser.uid));
        }

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // Sort: Pending first, then by Date desc
            list.sort((a, b) => {
                if (a.status === b.status) return new Date(b.createdAt) - new Date(a.createdAt);
                return a.status === 'pending' ? -1 : 1;
            });
            setDebts(list);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [currentUser, userRole]);

    const handleSettle = async (debt) => {
        if (userRole === 'driver') return; // Drivers cannot settle? Or maybe they can "Hand Over"? 
        // Office "Settles" means money is in safe.

        if (!window.confirm(`Confirm settlement of €${debt.amount} for ${debt.recipient}?`)) return;

        try {
            await updateDoc(doc(db, "debts", debt.id), {
                status: 'paid',
                paidAt: new Date().toISOString(),
                paidBy: currentUser.email
            });
            await logAction(currentUser, ACTIONS.UPDATE, `Debt Settled: €${debt.amount} for ${debt.recipient}`, debt.id);
        } catch (err) {
            console.error("Error settling debt:", err);
            alert("Error: " + err.message);
        }
    };

    const totalPending = debts.filter(d => d.status === 'pending').reduce((acc, curr) => acc + parseFloat(curr.amount || 0), 0);

    return (
        <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>

            {/* Summary Card */}
            <div className="glass-panel" style={{ textAlign: 'center', marginBottom: '1rem', background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)', color: 'white' }}>
                <h2 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>Total Pending Debt</h2>
                <div style={{ fontSize: '2rem', fontWeight: 'bold' }}>€ {totalPending.toFixed(2)}</div>
            </div>

            <div style={{ display: 'grid', gap: '1rem' }}>
                {debts.map(debt => (
                    <div key={debt.id} className="card" style={{
                        borderLeft: debt.status === 'pending' ? '4px solid #ef4444' : '4px solid #22c55e',
                        opacity: debt.status === 'paid' ? 0.7 : 1
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: debt.status === 'pending' ? '#ef4444' : '#22c55e', textTransform: 'uppercase' }}>
                                    {debt.status}
                                </div>
                                <h3 style={{ margin: '0.25rem 0' }}>{debt.recipient}</h3>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                                    Driver: {debt.driverName} | Date: {debt.date}
                                </div>
                                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                    Albarán: {debt.remittance}
                                </div>
                            </div>

                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '1.25rem', fontWeight: 'bold', color: '#ef4444' }}>
                                    € {debt.amount}
                                </div>

                                {debt.status === 'pending' && (userRole === 'office' || userRole === 'backoffice') && (
                                    <button
                                        onClick={() => handleSettle(debt)}
                                        className="primary-button"
                                        style={{ marginTop: '0.5rem', background: '#22c55e', padding: '0.4rem 1rem', fontSize: '0.8rem' }}
                                    >
                                        $ Settle
                                    </button>
                                )}
                                {debt.status === 'paid' && (
                                    <div style={{ fontSize: '0.8rem', color: '#22c55e', marginTop: '0.5rem' }}>
                                        ✓ Paid on {new Date(debt.paidAt).toLocaleDateString()}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                ))}

                {debts.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                        No debts found. Clean sheet! 🎉
                    </div>
                )}
            </div>
        </div>
    );
}
