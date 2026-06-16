/* @scale/shared/chat — punto de entrada del chat cross-app. */
export { ChatBase } from "./ChatBase.jsx";
export { BellButton } from "./BellButton.jsx";
export { PresenceAvatars } from "./PresenceAvatars.jsx";
export { Avatar, avatarColor, iniciales } from "./avatar.jsx";
export {
  cargarTodosMensajes, enviarMensaje, marcarLeidos,
  suscribirMensajes, cargarMiembros,
} from "./data.js";
export {
  serializarToken, parsearMensaje, construirDeepLink,
  leerCmdDeUrl, detectarAutocompletar,
} from "./commands.js";
export {
  crearNotificacion, cargarNotificaciones, suscribirNotificaciones,
  cargarUltimaVez, marcarVistoAhora,
} from "./notifications.js";
export { suscribirPresencia } from "./presence.js";
