import './index.css';

import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';
import { initAuth } from './services/auth';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// #163: resolve a returning sign-in; the app renders signed out meanwhile.
void initAuth();

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
