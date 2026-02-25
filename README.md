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

## Configuración

### Desarrollo

Copiar `src/environments/environment.example.ts` a `src/environments/environment.ts` y editar con los valores reales del entorno de desarrollo:

```ts
export const environment = {
  production: false,
  websocketUrl: 'wss://BACKEND-CHATBOT-DEV.net/ws/query', // Ingresar URL del backend para el chatbot DEV
  apiKey: 'TU_API_KEY_DEV' // Ingresar apiKey del backend para el chatbot DEV
};
```

### Producción

Editar `src/environments/environment.prod.ts` con los valores reales del entorno de producción manteniendo el placeholder para `apiKey`, ya que este es reemplazado por la variable de entorno `API_KEY`:

```ts
export const environment = {
  production: true,
  websocketUrl: 'wss://BACKEND-CHATBOT-PRODUCTIVO.net/ws/query', // Ingresar URL del backend para el chatbot PRODUCTIVO
  apiKey: 'API_KEY_PLACEHOLDER' // ¡No modificar! Se reemplazará automáticamente por la variable de entorno `API_KEY`
};
```

Al momento de compilar la versión productiva con `npm run build`:
- Se leerá la variable de entorno `API_KEY` definida en la configuración del entorno de AWS (ej: variables de entorno en EC2, ECS, Elastic Beanstalk o Systems Manager Parameter Store)
- Se escribirá en `src/environments/environment.prod.ts`
- Se compilará
- Se restaurará el `API_KEY_PLACEHOLDER` en `src/environments/environment.prod.ts` para futuros builds.

**El placeholder no se reemplaza automáticamente en DEV**.

## Servidor de desarrollo

```bash
ng serve
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
ng build --configuration production
```

Los artefactos se generan en el directorio `dist/`.

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