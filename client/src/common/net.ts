// In local dev the Vite client (port 5173) talks to the API on :4000.
// In production the Node server serves both the client and the API on one origin (HTTPS/WSS).
const dev = window.location.port === "5173";
const host = window.location.hostname || "localhost";
export const API = dev ? `http://${host}:4000` : "";
export const WS_URL = dev
  ? `ws://${host}:4000`
  : `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}`;
