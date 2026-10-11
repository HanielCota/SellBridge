import type { ApiOperation } from "../endpoint";
import { getMe } from "./me.server";

/** Every public operation, in the order the docs list them. Add new endpoints here. */
export const API_OPERATIONS: readonly ApiOperation[] = [getMe];
