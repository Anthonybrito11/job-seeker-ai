# Panel privado en Netlify

El panel se puede consultar desde otros dispositivos sin mantener encendido el equipo local. El agente y sus sesiones de navegador permanecen en el equipo local. Netlify solo publica la interfaz y una API de lectura conectada a PostgreSQL.

## Configuración

1. Crear un sitio de Netlify usando `netlify.toml`. El directorio público es exclusivamente `dist/dashboard`; nunca publicar la raíz del repositorio.
2. Crear un cliente OAuth de Google de tipo aplicación web. Añadir `https://<sitio>.netlify.app/auth/callback` como URI de redirección autorizada.
3. Configurar las siguientes variables para las funciones de Netlify:

| Variable | Valor |
| --- | --- |
| `DATABASE_URL` | Conexión PostgreSQL de Neon, preferiblemente con un usuario de solo lectura |
| `USER_ID` | ID del usuario del panel |
| `DASHBOARD_ORIGIN` | Origen HTTPS canónico, sin ruta |
| `DASHBOARD_ALLOWED_EMAIL` | Único correo autorizado para entrar |
| `GOOGLE_CLIENT_ID` | ID del cliente OAuth web |
| `GOOGLE_CLIENT_SECRET` | Secreto del cliente OAuth |
| `DASHBOARD_SESSION_SECRET` | Secreto aleatorio de al menos 32 caracteres |

Guardar secretos mediante la interfaz o CLI de Netlify, con alcance de funciones. No añadirlos a `netlify.toml`, Git ni al HTML. Usar un proyecto de producción propio o añadir el correo autorizado como usuario de prueba en Google, según el estado de publicación de OAuth.

## Verificación

```bash
node --test tests/hosting/auth.test.cjs tests/hosting/render.test.cjs
node scripts/build-dashboard.js
```

Después del despliegue, `/api/data` debe responder 401 sin sesión y nunca devolver datos. Tras entrar con la cuenta autorizada, el panel debe mostrar los datos de Neon. Una cuenta distinta no obtiene sesión. Si faltan variables, el servidor responde 503 y mantiene los datos privados.

La sesión usa cookies Secure, HttpOnly y SameSite, y dura siete días. El acceso de Google pide únicamente identidad y correo, sin permisos de Gmail. Las respuestas de la API no se almacenan en caché. El panel solo consulta los datos ya registrados: no ejecuta postulaciones, no abre navegadores ni envía mensajes.

Para revocar sesiones existentes, cambiar `DASHBOARD_SESSION_SECRET` y volver a desplegar. Para cambiar el propietario autorizado, actualizar `DASHBOARD_ALLOWED_EMAIL`. Los errores del servidor no incluyen credenciales ni detalles de conexión.
