/* @scale/shared/chat — punto de entrada del chat cross-app. */
export { ChatBase } from "./ChatBase.jsx";
export { BellButton } from "./BellButton.jsx";
export {
  cargarTodosMensajes, enviarMensaje, marcarLeidos,
  suscribirMensajes, cargarMiembros,
} from "./data.js";
export {
  serializarToken, parsearMensaje, construirDeepLink,
  leerCmdDeUrl, detectarAutocompletar,
} from "./commands.js";
