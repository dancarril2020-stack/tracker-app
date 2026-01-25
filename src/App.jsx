import React, { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { db, collection, query, where, onSnapshot } from './firebase'; // Added imports
import LoginScreen from './components/LoginScreen';
import DeliveryForm from './components/DeliveryForm';
import LoadingTab from './components/LoadingTab';
import PickupTab from './components/PickupTab';
import DeliverySummary from './components/DeliverySummary';
import logo from './assets/logo.png';

import UserManagement from './components/UserManagement';
import AuditTab from './components/AuditTab';
import ThemeToggle from './components/ThemeToggle';
import DebtsTab from './components/DebtsTab';

function AuthenticatedApp() {
  const { currentUser, userRole, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('loading');

  // --- BADGE STATE ---
  const [badges, setBadges] = useState({ deliveries: 0, pickups: 0 });

  useEffect(() => {
    if (userRole === 'office' || userRole === 'backoffice') {
      setActiveTab('summary');
    } else if (userRole === 'driver') {
      setActiveTab('loading');
    }
  }, [userRole]);

  // --- BADGE LISTENER (DRIVER ONLY) ---
  useEffect(() => {
    if (userRole !== 'driver' || !currentUser) {
      setBadges({ deliveries: 0, pickups: 0, loads: 0 });
      return;
    }

    const today = new Date().toISOString().split('T')[0];
    const recordsRef = collection(db, "records");

    // 1. Pending Loads Badge (Now 'Assigned' Loads waiting for pickup? or Pending Deliveries?)
    // Usually 'Loads' tab badge means "You have work to do (Load)".
    // So we should count 'assigned_load'.
    const qLoads = query(
      recordsRef,
      where("driverId", "==", currentUser.uid),
      where("date", "==", today),
      where("type", "==", "load"),
      where("status", "==", "assigned_load") // NEW: Metric for "To Load"
    );

    // 2. Pending Pickups Badge
    const qPickups = query(
      recordsRef,
      where("driverId", "==", currentUser.uid),
      where("type", "==", "pickup"),
      where("status", "==", "assigned")
    );

    const unsubLoads = onSnapshot(qLoads, (snap) => {
      setBadges(prev => ({ ...prev, loads: snap.size }));
    });

    const unsubPickups = onSnapshot(qPickups, (snap) => {
      setBadges(prev => ({ ...prev, pickups: snap.size }));
    });

    return () => {
      unsubLoads();
      unsubPickups();
    };
  }, [userRole, currentUser]);


  if (!currentUser) return <LoginScreen />;

  // Badge Component
  const Badge = ({ count }) => {
    if (count <= 0) return null;
    return (
      <span style={{
        position: 'absolute',
        top: '-5px',
        right: '-5px',
        background: '#ef4444',
        color: 'white',
        borderRadius: '50%',
        minWidth: '18px',
        height: '18px',
        fontSize: '0.75rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 'bold',
        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
        zIndex: 10
      }}>
        {count}
      </span>
    );
  };

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
          style={{ position: 'relative', overflow: 'visible' }}
        >
          Loads
          <Badge count={badges.loads} />
        </button>
        <button
          className={`tab-button ${activeTab === 'delivery' ? 'active' : ''}`}
          onClick={() => setActiveTab('delivery')}
          style={{ position: 'relative', overflow: 'visible' }} // Allow badge overflow
        >
          Deliveries
          <Badge count={badges.deliveries} />
        </button>
        <button
          className={`tab-button ${activeTab === 'pickup' ? 'active' : ''}`}
          onClick={() => setActiveTab('pickup')}
          style={{ position: 'relative', overflow: 'visible' }}
        >
          Pick-ups
          <Badge count={badges.pickups} />
        </button>
        <button
          className={`tab-button ${activeTab === 'summary' ? 'active' : ''}`}
          onClick={() => setActiveTab('summary')}
        >
          Summary
        </button>
        {(userRole === 'office' || userRole === 'backoffice') && (
          <>
            <button
              className={`tab-button ${activeTab === 'debts' ? 'active' : ''}`}
              onClick={() => setActiveTab('debts')}
              style={{ borderBottom: activeTab === 'debts' ? '2px solid #ef4444' : 'none' }}
            >
              Debts 💸
            </button>
            <button
              className={`tab-button ${activeTab === 'users' ? 'active' : ''}`}
              onClick={() => setActiveTab('users')}
            >
              Users
            </button>
          </>
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
        {activeTab === 'debts' && <DebtsTab />}
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
