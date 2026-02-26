import React, { useState, useEffect } from 'react';
import { registerUser, getUsers, getUsersByTenant } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import { logAction, ACTIONS } from '../utils/audit';

export default function UserManagement() {
    const { tenantId } = useAuth();
    const isSuperAdmin = tenantId === 'admin';
    const [users, setUsers] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'driver',
        role: 'driver',
        tenantId: tenantId === 'admin' ? '' : tenantId
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadUsers();
    }, []);

    async function loadUsers() {
        try {
            const userList = isSuperAdmin ? await getUsers() : await getUsersByTenant(tenantId);
            setUsers(userList);
        } catch (err) {
            console.error("Error loading users:", err);
            setError("Failed to load users.");
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        setError('');
        setSuccess('');
        setLoading(true);

        try {
            await registerUser(formData.email, formData.password, formData.role, formData.name, formData.tenantId);

            // LOG AUDIT (Manual creation)
            await logAction({ ...formData, uid: 'new-user' }, ACTIONS.CREATE_ITEM, `Created user: ${formData.email} (${formData.role})`, null, { targetTenant: formData.tenantId });

            setSuccess(`User ${formData.name} created successfully!`);
            setFormData({
                name: '',
                email: '',
                password: '',
                role: 'driver',
                tenantId: isSuperAdmin ? formData.tenantId : tenantId // Keep current tenantId selection for admin, or reset for client
            });
            await loadUsers(); // Refresh list
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="animate-fade-in" style={{ maxWidth: '800px', margin: '0 auto' }}>

            {/* Create User Form */}
            <div className="glass-panel" style={{ marginBottom: '2rem' }}>
                <h2 style={{ marginTop: 0 }}>Create New User</h2>
                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

                    <div className="form-group">
                        <label>Name</label>
                        <input
                            type="text"
                            required
                            placeholder="e.g. John Doe"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label>Email</label>
                        <input
                            type="email"
                            required
                            placeholder="e.g. john@tvr.com"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                        />
                    </div>

                    <div className="form-group">
                        <label>Password</label>
                        <input
                            type="password"
                            required
                            placeholder="Enter password"
                            value={formData.password}
                            onChange={e => setFormData({ ...formData, password: e.target.value })}
                            minLength={6}
                        />
                    </div>

                    <div className="form-group">
                        <label>Role</label>
                        <select
                            value={formData.role}
                            onChange={e => setFormData({ ...formData, role: e.target.value })}
                            style={{ padding: '0.8rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)' }}
                        >
                            <option value="driver">Driver</option>
                            <option value="office">Office</option>
                            <option value="backoffice">Backoffice</option>
                        </select>
                    </div>



                    {isSuperAdmin && (
                        <div className="form-group">
                            <label>Tenant ID <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>(e.g. client-a, client-b)</span></label>
                            <input
                                type="text"
                                required
                                placeholder="e.g. client-a"
                                value={formData.tenantId}
                                onChange={e => setFormData({ ...formData, tenantId: e.target.value.toLowerCase().replace(/\s+/g, '-') })}
                            />
                        </div>
                    )}

                    {error && <div style={{ color: '#ef4444' }}>{error}</div>}
                    {success && <div style={{ color: '#22c55e' }}>{success}</div>}


                    <button type="submit" className="primary-button">
                        Create User
                    </button>
                </form>
            </div >

            {/* User List */}
            < div className="glass-panel" >
                <h3 style={{ marginTop: 0 }}>Existing Users</h3>
                <div style={{ display: 'grid', gap: '0.8rem' }}>
                    {users.map((user, idx) => (
                        <div key={idx} style={{
                            padding: '1rem',
                            background: 'rgba(255,255,255,0.05)',
                            borderRadius: '4px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <div style={{ fontWeight: 'bold' }}>{user.name}</div>
                                <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{user.email}</div>
                                {user.tenantId && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--primary)', marginTop: '0.2rem' }}>🏢 {user.tenantId}</div>
                                )}
                            </div>
                            <span style={{
                                textTransform: 'uppercase',
                                fontSize: '0.75rem',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '12px',
                                background: user.role === 'office' ? '#3b82f6' : user.role === 'backoffice' ? '#a855f7' : '#22c55e',
                                color: 'white'
                            }}>
                                {user.role}
                            </span>
                        </div>
                    ))}
                </div>
            </div >
        </div >
    );
}
