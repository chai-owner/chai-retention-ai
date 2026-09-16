// Type-only shim so client modules can reference PaddleEnv without importing
// the server-only paddle.server.ts module (which is blocked from the client
// bundle by filename).
export type PaddleEnv = "sandbox" | "live";
