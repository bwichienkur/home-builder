import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AppErrorBoundary } from './components/ui/AppErrorBoundary';
import './styles.css';
import './studio.css';
import './loading.css';
import './advanced.css';
import './openings.css';
import './catalog.css';
import './features/auth/auth.css';
import './features/shell/shell.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
