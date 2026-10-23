import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import PublicExamPage from './components/PublicExamPage.tsx';
import './index.css';

const match = window.location.pathname.match(/^\/exam\/([0-9a-f-]{36})\/?$/i);
createRoot(document.getElementById('root')!).render(match ? <PublicExamPage examId={match[1]} /> : <App />);

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
