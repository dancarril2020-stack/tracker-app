import React, { useState, useEffect } from 'react';
import { registerUser, getUsers } from '../firebase';

export default function UserManagement() {
    const [users, setUsers] = useState([]);
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: 'password', // Default mock password
        role: 'driver'
    });
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');

    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadUsers();
    }, []);

    async function loadUsers() {
        try {
            const userList = await getUsers();
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
            await registerUser(formData.email, formData.password, formData.role, formData.name);
            setSuccess(`User ${formData.name} created successfully!`);
            setFormData({ ...formData, name: '', email: '' }); // Reset fields
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
                        <label>Role</label>
                        <select
                            value={formData.role}
                            onChange={e => setFormData({ ...formData, role: e.target.value })}
                            style={{ padding: '0.8rem', borderRadius: '4px', background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}
                        >
                            <option value="driver">Driver</option>
                            <option value="office">Office</option>
                            <option value="backoffice">Backoffice</option>
                        </select>
                    </div>

                    {error && <div style={{ color: '#ef4444' }}>{error}</div>}
                    {success && <div style={{ color: '#22c55e' }}>{success}</div>}

                    <button type="submit" className="primary-button">
                        Create User
                    </button>
                </form>
            </div>

            {/* User List */}
            <div className="glass-panel">
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
            </div>
        </div>
    );
}
