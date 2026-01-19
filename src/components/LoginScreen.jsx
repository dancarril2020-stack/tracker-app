import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo.png';
import ThemeToggle from './ThemeToggle';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const { login } = useAuth();

    async function handleSubmit(e) {
        e.preventDefault();

        try {
            setError('');
            setLoading(true);
            await login(email, password);
        } catch (err) {
            console.error(err);
            setError('Failed to log in. Check credentials.');
        }

        setLoading(false);
    }

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '2rem',
            position: 'relative'
        }}>
            <ThemeToggle style={{ position: 'absolute', top: '2rem', right: '2rem' }} />
            <div className="glass-panel animate-fade-in" style={{ width: '100%', maxWidth: '400px' }}>
                <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
                    <img src={logo} alt="TVR" style={{ height: '60px', marginBottom: '1rem' }} />
                    <h2 style={{ margin: 0 }}>Log In</h2>
                    <p style={{ color: 'var(--text-muted)' }}>Welcome to TVR Logistics</p>
                </div>

                {error && <div style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#fca5a5',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    textAlign: 'center'
                }}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <label className="label">Email / User</label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="driver@tvr.com"
                        />
                    </div>

                    <div style={{ marginBottom: '2rem' }}>
                        <label className="label">Password</label>
                        <input
                            type="password"
                            required
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="********"
                        />
                    </div>

                    <button disabled={loading} type="submit" style={{ width: '100%' }}>
                        {loading ? 'Logging In...' : 'Log In'}
                    </button>
                </form>
            </div>

            <p style={{ marginTop: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Access restricted to authorized personnel only.
                <br />
                Session active: 08:00 - 20:30
            </p>
        </div>
    );
}
