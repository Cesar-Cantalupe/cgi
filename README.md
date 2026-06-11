# Educgi

Aplicación Angular para el chatbot educativo CGI. Generada con [Angular CLI](https://github.com/angular/angular-cli) versión 16.2.16.

---

## Requisitos previos

- Node.js >= 16.x
- Angular CLI >= 16.x (`npm install -g @angular/cli`)

---

## Instalación

```bash
npm install
```

---

## Configuración de entorno

El proyecto usa un flujo similar a Next.js con `.env.local`. Consulta [`src/environments/README.md`](src/environments/README.md) para todos los detalles.

```bash
cp .env.example .env.local
# Editar .env.local con los valores reales
npm start   # genera environment.ts e inicia el servidor
```

---

## Firebase (traducciones i18n)

La app almacena traducciones en Firestore. Guía paso a paso para el cliente:

**[`docs/CONFIGURACION_FIREBASE.md`](docs/CONFIGURACION_FIREBASE.md)**

Referencia técnica: [`firebase/README.md`](firebase/README.md) · Panel de edición: [`docs/ADMIN_PANEL_TUTORIAL.md`](docs/ADMIN_PANEL_TUTORIAL.md)

---

## Servidor de desarrollo

```bash
npm start
# o bien: ng serve
```

Navega a `http://localhost:4200/`. La aplicación se recargará automáticamente al cambiar ficheros fuente.

---

## Build

### Desarrollo

```bash
ng build
```

### Producción

```bash
npm run build
```

Los artefactos se generan en el directorio `dist/`.

---

## Comandos útiles

| Comando                 | Descripción                                     |
|-------------------------|-------------------------------------------------|
| `npm start`             | Sincroniza `.env.local` + inicia servidor dev   |
| `npm run sync-env`      | Regenera `environment.ts` desde `.env.local`    |
| `npm run build`         | Build de producción (reemplaza `API_KEY`)       |
| `npm run build:dev`     | Build de dev                                    |
| `npm run i18n:push`     | Sube traducciones a Firestore                   |
| `npm run test:firebase` | Verifica conexión y datos en Firestore          |

---

## Generar componentes

```bash
ng generate component nombre-componente
ng generate service nombre-servicio
ng generate module nombre-modulo
```

---

## Tests unitarios

```bash
ng test
```

Ejecuta los tests unitarios mediante [Karma](https://karma-runner.github.io).

---

## Tests end-to-end

```bash
ng e2e
```

---

## Estructura del proyecto

```
src/
├── app/
│   ├── components/
│   │   ├── chatbot/          # Componentes del chatbot (mensajes, sidebar, input, etc.)
│   │   ├── header/           # Cabecera con selector de idioma y logout
│   │   ├── footer/           # Pie de página
│   │   ├── home/             # Página de bienvenida
│   │   └── login-form/       # Formulario de login
│   ├── services/
│   │   ├── auth.service.ts   # Autenticación
│   │   ├── translation.service.ts  # Internacionalización
│   │   └── chatbot/          # Lógica del chatbot y WebSocket
│   ├── guards/               # AuthGuard para rutas protegidas
│   └── pipes/                # Pipe de traducción
├── environments/             # Configuración por entorno
└── assets/                   # Imágenes y recursos estáticos
```

---

## Idiomas soportados

La aplicación soporta los siguientes idiomas, seleccionables desde el header:

`EN` · `ES` · `FR` · `CA` · `DE` · `EL`

---

## Ayuda adicional

Consulta `ng help` o la [documentación oficial de Angular CLI](https://angular.io/cli).