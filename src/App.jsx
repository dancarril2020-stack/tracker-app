import React, { useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import LoginScreen from './components/LoginScreen';
import DeliveryForm from './components/DeliveryForm';
import LoadingTab from './components/LoadingTab';
import PickupTab from './components/PickupTab';
// We will update Summary later, keeping import for now or temporary comment
import DeliverySummary from './components/DeliverySummary';
import logo from './assets/logo.png';

import UserManagement from './components/UserManagement';
import AuditTab from './components/AuditTab'; // Import added 
import ThemeToggle from './components/ThemeToggle';

function AuthenticatedApp() {
  const { currentUser, userRole, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('loading');

  React.useEffect(() => {
    if (userRole === 'office' || userRole === 'backoffice') {
      setActiveTab('summary');
    } else if (userRole === 'driver') {
      setActiveTab('loading');
    }
  }, [userRole]);

  if (!currentUser) return <LoginScreen />;

  return (
    <>
      <header style={{ marginBottom: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, right: 0 }}>
          <ThemeToggle />
        </div>
        <img src={logo} alt="TVR Logo" style={{ height: '60px', width: 'auto' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', maxWidth: '800px', alignItems: 'center' }}>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ fontSize: '1.5rem', margin: 0, color: 'var(--text-main)' }}>TVR Logistics</h1>
            <p style={{ margin: 0, fontSize: '0.8rem', color: 'var(--primary)' }}>{userRole?.toUpperCase()} : {currentUser.email}</p>
          </div>
          <button onClick={logout} style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', background: 'transparent', border: '1px solid var(--primary)' }}>
            Log Out
          </button>
        </div>
      </header>

      <div className="tabs">
        <button
          className={`tab-button ${activeTab === 'loading' ? 'active' : ''}`}
          onClick={() => setActiveTab('loading')}
        >
          Loads
        </button>
        <button
          className={`tab-button ${activeTab === 'delivery' ? 'active' : ''}`}
          onClick={() => setActiveTab('delivery')}
        >
          Deliveries
        </button>
        <button
          className={`tab-button ${activeTab === 'pickup' ? 'active' : ''}`}
          onClick={() => setActiveTab('pickup')}
        >
          Pick-ups
        </button>
        <button
          className={`tab-button ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        {(userRole === 'office' || userRole === 'backoffice') && (
          <button
            className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
        )}
        {userRole === 'backoffice' && (
          <button
            className={`tab-button ${activeTab === 'audit' ? 'active' : ''}`}
            onClick={() => setActiveTab('audit')}
          >
            Audit Logs
          </button>
        )}
      </div>

      <main>
        {activeTab === 'loading' && <LoadingTab onCompleteLoad={() => setActiveTab('delivery')} />}
        {activeTab === 'delivery' && <DeliveryForm />}
        {activeTab === 'pickup' && <PickupTab />}
        {activeTab === 'summary' && <DeliverySummary />}
        {activeTab === 'users' && <UserManagement />}
        {activeTab === 'audit' && <AuditTab />}
      </main>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <AuthenticatedApp />
      </ThemeProvider>
    </AuthProvider>
  );
}

export default App;
