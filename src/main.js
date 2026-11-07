import '@fontsource/grandstander/latin-600.css';
import '@fontsource/grandstander/latin-700.css';
import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { mountApp } from './ui/app.js';
import { toast } from './ui/toast.js';

const app = mountApp(document.getElementById('app'));

navigator.storage?.persist?.().then((granted) => app.actions.setPersisted(granted), () => {});

const updateSW = registerSW({
  immediate: true,
  onOfflineReady: () => toast('Ready to work offline.'),
  onNeedRefresh: () => app.actions.setUpdateReady(() => updateSW(true)),
});
