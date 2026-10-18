import { createPeniClient } from "@peni/api";

/** Same origin: the browser sends the till's device cookie and the staff session cookie itself. */
export const api = createPeniClient({ baseUrl: "" });
