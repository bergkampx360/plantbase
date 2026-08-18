// Útvonal-határon (nem csak string-prefixen) illesztünk — enélkül egy jövőbeli /customers
// vagy /customer-service jellegű útvonal is tévesen egyezne egy /customer mintával, mert a
// puszta startsWith('/customer') karakterlánc-prefix, nem útvonal-szegmens egyezés.
// Kiemelve main.tsx-ből (J-rész audit) egy önálló, mellékhatás nélküli fájlba, hogy
// tesztelhető legyen — a main.tsx-nek van mellékhatása (root.render() modul-betöltéskor),
// azt nem akarjuk importálni csak egy tiszta függvény teszteléséhez.
export function matchesRoute(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}
