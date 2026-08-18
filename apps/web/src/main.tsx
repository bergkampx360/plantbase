import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import { CustomerApp } from './app/customer-app';
import './styles.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

// Minimál, függőség nélküli route-switch (J6, docs/implementation/09-customer-facing-poc.md,
// 6. döntés) — nincs react-router-dom a repóban, nem hozunk be új függőséget csak ehhez a
// két felülethez. /customer -> ügyfél-chat, egyébként a meglévő belső App.
function Root() {
  if (window.location.pathname.startsWith('/customer')) {
    return <CustomerApp />;
  }
  return <App />;
}

root.render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
