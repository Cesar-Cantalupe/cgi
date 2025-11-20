//main.ts
import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';
import * as ngCore from '@angular/core';

// Opcional: modo producción si no estás depurando
// import { enableProdMode } from '@angular/core';
// enableProdMode();

// Bootstrapping del módulo principal
platformBrowserDynamic()
.bootstrapModule(AppModule)
.catch(err => console.error(err));

// Solo para desarrollo: exponer Angular en window
declare global {
interface Window {
ng?: typeof ngCore;
}
}

if (!window.ng) {
window.ng = ngCore;
}
