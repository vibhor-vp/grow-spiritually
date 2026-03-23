import { Route } from '@angular/router';

export const appRoutes: Route[] = [
  {
    path: '',
    pathMatch: 'full',
    redirectTo: 'word-counter',
  },
  {
    path: 'word-counter',
    loadComponent: () =>
      import('./pages/word-counter/word-counter-sarvam.component').then(
        (m) => m.SarvamWordCounterComponent,
      ),
  },
  {
    path: '**',
    redirectTo: 'word-counter',
  },
];
