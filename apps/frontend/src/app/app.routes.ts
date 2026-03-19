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
      import('./pages/word-counter/word-counter.component').then(
        (m) => m.WordCounterComponent,
      ),
  },
  {
    path: '**',
    redirectTo: 'word-counter',
  },
];
