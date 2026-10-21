import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';
import { applyAppearance, loadAppearance } from './themes.js';

applyAppearance(loadAppearance()); // before first render, so there's no flash of the default theme

createRoot(document.getElementById('root')).render(<App />);
