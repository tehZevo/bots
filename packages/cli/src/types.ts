import type { Ctx } from "./http.ts";

export type MakeCtx = () => Ctx & { quiet: boolean; yes: boolean };
