# Measurement Venezuela

Dashboard de lectura para Caracas, basado en la referencia de OSY del 7 de
octubre de 2026. Conserva los siete KPIs, filtros mensual/semanal, grafica
diaria/acumulada, panel de cierre y fichas de investigacion.

## Desarrollo

Requiere Node.js 22.13 o superior.

```sh
npm ci
npm run setup:access
npm start
```

`setup:access` genera una clave aleatoria, guarda su hash scrypt en `.env` y
escribe las credenciales en un archivo fuera del repositorio. No sobrescribe
credenciales existentes. El acceso local es `http://localhost:4173`.

## Datos

La interfaz solicita los datos a `/api/dashboard` despues de autenticar la
sesion. La clave, la conexion de Google y las lecturas guardadas permanecen
en el servidor. El repositorio no contiene reales ni metas del negocio.

Variables de entorno de produccion:

- `APP_USERNAME`: usuario de acceso al dashboard.
- `APP_PASSWORD_HASH`: hash generado por `setup:access`, no clave en texto.
- `SESSION_SECRET`: secreto aleatorio generado por `setup:access`.
- `PUBLIC_BASE_URL`: URL HTTPS del despliegue, para validar el origen del login.
- `NODE_ENV`: `production` en el servidor publicado; habilita cookies HTTPS.
- `SHEET_ID`: identificador del Sheet aprobado.
- `DAILY_TRACKER_TAB`: nombre de la pestana, inicialmente `4. Daily Tracker`.
- `GOOGLE_SERVICE_ACCOUNT_JSON`: credenciales de una cuenta de servicio con
  permiso de lectura sobre el archivo y Google Sheets API habilitada.
- `ACTIVE_USERS_TAB`: tabla opcional de conteos deduplicados por dia y semana.

La tabla opcional de activos usa nueve columnas: fecha, inicio de semana,
fin de semana, dia, activos diarios, unicos acumulados semanales, unicos de
semana completa, target semanal y estado (`completo`). Nunca se suman DAU
para reconstruir usuarios unicos. Si faltan los unicos o trips del mismo
rango, la frecuencia se muestra sin dato.

Los planes diarios se conservan tal como llegan del tracker. Las proyecciones
mensuales utilizan su presupuesto mensual aprobado. Una diferencia entre la
suma de planes diarios y la meta mensual se muestra, no se corrige en silencio.
New users utiliza la columna `Act in Yango`; el resumen `Act wo BipBip` mide
una poblacion diferente y no se intercambia automaticamente.

Sin conexion de Google, el servidor puede mostrar una lectura privada en
`data/snapshot.json`. Esa lectura queda identificada como guardada y conserva
su fecha de corte. No se incluye en GitHub. La conexion en este chat no se
transfiere al servidor: las variables de produccion deben configurarse aparte.

## Despliegue desde GitHub

El dashboard requiere usuario/clave, independientemente de la visibilidad del
repositorio. Railway puede
leer el repositorio, ejecutar `npm run build` y luego `npm start`. Su archivo de
configuracion incluye comprobacion de salud en `/healthz`. Configure las
variables antes de publicar y conserve el mismo servicio y dominio al actualizar.

GitHub Pages no ejecuta el servidor de autenticacion ni la lectura privada del
Sheet. No publique un snapshot de negocio como archivo estatico.

Las tipografias corporativas no se redistribuyen en este repositorio publico.
La interfaz utiliza Arial como alternativa hasta contar con permiso de licencia.

## Validacion

```sh
npm test
npm run build
```

Las pruebas cubren login, sesiones, acceso a datos, origen de solicitudes,
deduplicacion agregada, ventanas temporales, frecuencia y estados sin datos.
