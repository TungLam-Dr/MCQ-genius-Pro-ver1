import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

createRoot(document.getElementById('root')!).render(<App />);

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.register('/sw.js').then(registration => {
      void registration.update();
      if (hadController) {
        navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), { once: true });
      }
    }).catch(error => console.warn('Không thể bật chế độ offline:', error));
  });
}
