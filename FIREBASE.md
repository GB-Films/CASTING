# Ranking de Casting

Estado de configuración: pendiente de renovar la sesión de Google/Firebase.
Los intentos de creación desde Firebase console fallaron y la CLI informó que
las credenciales locales vencieron. `firebase-config.js` permanece en `null`;
por tanto, aún no hay envíos remotos ni un proyecto conectado confirmado.

## Servicios

La app usa Cloud Firestore Standard y Firebase Authentication anónimo. No pide
correo ni contraseña al jugador. El nombre es un apodo público, no una identidad
verificada. Dos personas pueden usar el mismo nombre; los registros no se mezclan
ni se sobrescriben. No habilitar Google Analytics ni cambiar a un plan pago para
este flujo. El plan gratuito tiene cuotas; si se agotan, los envíos quedan pendientes.

## Activación

1. Crear un proyecto Firebase y registrar una app web llamada Casting.
2. Copiar el objeto de configuración web a `firebase-config.js` en lugar de `null`.
   La configuración web es pública; nunca copiar credenciales de Firebase Admin.
3. En Authentication, habilitar el proveedor Anónimo.
4. Crear Cloud Firestore Standard, base `(default)`, inicialmente en producción.
5. Publicar `firestore.rules` y crear el índice de `firestore.indexes.json`.
6. Publicar los cinco archivos del juego. Firebase Hosting queda preparado en
   `firebase.json` y puede publicarse con la CLI si se desea usar ese alojamiento.
   Registrar el dominio del juego en los dominios autorizados de Authentication
   si el servicio lo solicita.

Con la CLI de Firebase autenticada, reemplazar PROJECT_ID por el proyecto real:

```powershell
npx firebase-tools deploy --project PROJECT_ID --only firestore:rules,firestore:indexes
```

Para publicar también la web en Firebase Hosting:

```powershell
npx firebase-tools deploy --project PROJECT_ID --only hosting
```

## Registros y ranking

Cada documento de `matches` contiene: ID único del intento, ID de la partida,
ID anónimo del navegador, nombre, dificultad, puntaje, segundos de juego,
derribados, número de reintento (0 en el primero), toma alcanzada (1–4), resultado
(`won`, `lost`, `abandoned`), fecha local de finalización, fecha del servidor y versión.
El tiempo y puntaje son los acumulados que muestra el juego; repetir una toma
restaura el puntaje del checkpoint y conserva el tiempo acumulado. Cada intento
finalizado se registra una sola vez con un ID estable, incluso si hay reenvíos.

El ranking muestra las mejores 50 partidas por dificultad (todas las personas,
todas las fechas, incluidos los intentos perdidos o abandonados), con desempate
por menor tiempo y luego fecha del servidor. No agrupa por nombre; una persona
puede tener varias entradas. El historial completo permanece en Firestore;
la vista local conserva las últimas 100 partidas ya enviadas y todos los envíos
pendientes. El jugador puede consultar ambos modos desde VER RANKING.

Un abandono se registra al volver al menú. Cerrar abruptamente la pestaña o el
navegador durante una partida no garantiza un resultado final. Borrar los datos
del navegador elimina resultados locales pendientes; el modo privado puede
impedir su conservación. Si falla el almacenamiento, la pantalla lo advierte.

## Protección y límites

Las reglas permiten crear solo documentos con campos válidos, autenticación
anónima y fecha del servidor. Impiden modificar o borrar partidas desde el cliente.
Las consultas públicas tienen límite de 50 filas. Son reglas para un ranking
casual: el juego calcula el puntaje en el navegador, y un usuario avanzado puede
fabricar valores dentro de los límites permitidos. Para concursos con premios
haría falta validar partidas en un servidor y reforzar abuso con App Check.
No hay un servicio de moderación de apodos ni control de frecuencia adicional.

## Verificación

Ejecutar `node --test tests/rankings.test.cjs`. Con Firebase configurado,
comprobar además una partida real: guardar un resultado, verificar su documento
en Firestore y consultarlo desde otro navegador. Las pruebas locales no prueban
permisos, cuotas o índices de un proyecto Firebase remoto.

Documentación: [Configuración web](https://firebase.google.com/docs/web/setup),
[autenticación anónima](https://firebase.google.com/docs/auth/web/anonymous-auth),
[reglas de Firestore](https://firebase.google.com/docs/firestore/security/rules-conditions).
