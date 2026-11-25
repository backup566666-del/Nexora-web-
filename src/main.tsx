import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initNexoraAppCheck } from './services/firebase/messagingAndAppCheck';

initNexoraAppCheck();

createRoot(document.getElementById('root')!).render(<App />);
