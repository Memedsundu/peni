// Shared with the client (the café page builds its own .ics when the server can't): the module
// lives in `lib/`, where nothing server-only may enter.
export { buildIcs, type IcsEvent } from "@/lib/ics";
