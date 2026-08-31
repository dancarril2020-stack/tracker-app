import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import logo from '../assets/logo3_tracker.png';
import ThemeToggle from './ThemeToggle';

export default function LoginScreen() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Toggles the UI between the standard login form and the password reset form
    const [isResetView, setIsResetView] = useState(false);
    // Stores the success message after a reset link is dispatched
    const [resetMessage, setResetMessage] = useState('');
    const { login, resetPassword } = useAuth();

    async function handleSubmit(e: React.FormEvent) {
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

    /**
     * Handles the password reset form submission.
     * Validates the email input, calls the context method, and manages loading/error states.
     */
    async function handleResetSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!email) {
            setError('Please enter your email to reset the password.');
            return;
        }

        try {
            setError('');
            setResetMessage('');
            setLoading(true);
            await resetPassword(email);
            setResetMessage('Password reset link sent to your email.');
        } catch (err) {
            console.error(err);
            setError('Failed to send reset email. Verify your email address.');
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
                    <img src={logo} alt="TVR" style={{ height: '150px', marginBottom: '0rem' }} />
                    <h2 style={{ margin: 0 }}>{isResetView ? 'Reset Password' : 'Log In'}</h2>
                    <p style={{ color: 'var(--text-muted)' }}>
                        {isResetView ? 'Enter your email to receive a reset link' : 'Welcome to Tracker Logistics'}
                    </p>
                </div>

                {error && <div style={{
                    background: 'rgba(239, 68, 68, 0.2)',
                    color: '#fca5a5',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    textAlign: 'center'
                }}>{error}</div>}

                {resetMessage && <div style={{
                    background: 'rgba(34, 197, 94, 0.2)',
                    color: '#86efac',
                    padding: '1rem',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    textAlign: 'center'
                }}>{resetMessage}</div>}

                {!isResetView ? (
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

                        <div style={{ marginBottom: '1.5rem' }}>
                            <label className="label">Password</label>
                            <input
                                type="password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="********"
                            />
                        </div>

                        <div style={{ marginBottom: '1.5rem', textAlign: 'right' }}>
                            <button
                                type="button"
                                className="text-button"
                                onClick={() => { setIsResetView(true); setError(''); setResetMessage(''); }}
                                style={{ fontSize: '0.9rem', color: 'var(--primary-color)', backgroundColor: 'transparent', padding: 0 }}
                            >
                                Forgot Password?
                            </button>
                        </div>

                        <button disabled={loading} type="submit" style={{ width: '100%' }}>
                            {loading ? 'Logging In...' : 'Log In'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleResetSubmit}>
                        <div style={{ marginBottom: '2rem' }}>
                            <label className="label">Email</label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="driver@tvr.com"
                            />
                        </div>

                        <button disabled={loading} type="submit" style={{ width: '100%', marginBottom: '1rem' }}>
                            {loading ? 'Sending...' : 'Send Reset Link'}
                        </button>

                        <button
                            type="button"
                            className="text-button"
                            onClick={() => { setIsResetView(false); setError(''); setResetMessage(''); }}
                            style={{ width: '100%', color: 'var(--text-muted)' }}
                        >
                            Back to Login
                        </button>
                    </form>
                )}
            </div>

            <p style={{ marginTop: '2rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                Access restricted to authorized personnel only.
                <br />
                Session active: 08:00 - 20:30
            </p>
        </div>
    );
}
