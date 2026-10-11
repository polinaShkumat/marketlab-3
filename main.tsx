import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AccountProvider } from './store';
import './index.css';

const saved = (() => { try { return localStorage.getItem('marketlab:theme'); } catch { return null; } })();
if (saved === 'dark') document.documentElement.classList.add('dark');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AccountProvider>
      <App />
    </AccountProvider>
  </React.StrictMode>,
);
