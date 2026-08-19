import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import { CustomerApp } from './app/customer-app';
import { StaffHandoffsPage } from './app/staff-handoffs-page';
import { matchesRoute } from './route-match';
import './styles.css';

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement,
);

// Minimál, függőség nélküli route-switch (J6, docs/implementation/09-customer-facing-poc.md,
// 6. döntés) — nincs react-router-dom a repóban, nem hozunk be új függőséget csak ehhez a
// három felülethez. /customer -> ügyfél-chat, /staff/handoffs -> staff jóváhagyási felület
// (J7), egyébként a meglévő belső App. A matchesRoute() logika saját, tesztelt fájlban
// (route-match.ts) — a main.tsx-nek van mellékhatása (root.render() modul-betöltéskor).
function Root() {
  const { pathname } = window.location;
  if (matchesRoute(pathname, '/customer')) {
    return <CustomerApp />;
  }
  if (matchesRoute(pathname, '/staff/handoffs')) {
    return <StaffHandoffsPage />;
  }
  return <App />;
}

root.render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
