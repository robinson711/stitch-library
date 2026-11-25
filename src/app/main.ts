// Stitch Library app: starts up and shows the right screen for the address.
import './app.css';
import { startNav, type Route } from './nav';
import { freeScreenUrls, hideWorking } from './ui';
import { homeScreen } from './home';
import { addScreen } from './add';
import { chartScreen } from './chart';
import { editScreen } from './edit';

function show(r: Route) {
  hideWorking();
  freeScreenUrls();
  document.querySelectorAll('dialog').forEach((d) => d.remove());
  switch (r.name) {
    case 'add': return addScreen();
    case 'chart': return void chartScreen(r.id);
    case 'edit': return void editScreen(r.id);
    default: return void homeScreen();
  }
}

startNav(show);
