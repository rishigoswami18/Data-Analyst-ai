import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App';
import { AuthProvider } from './contexts/AuthContext';
import { DatasetProvider } from './contexts/DatasetContext';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <DatasetProvider>
          <App />
        </DatasetProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
