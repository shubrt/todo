/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiCommands from "../apiCommands.js";
import type * as auth from "../auth.js";
import type * as authActions from "../authActions.js";
import type * as authCrypto from "../authCrypto.js";
import type * as completions from "../completions.js";
import type * as crons from "../crons.js";
import type * as domain from "../domain.js";
import type * as http from "../http.js";
import type * as httpHelpers from "../httpHelpers.js";
import type * as recurrences from "../recurrences.js";
import type * as scheduling from "../scheduling.js";
import type * as settings from "../settings.js";
import type * as tasks from "../tasks.js";
import type * as time from "../time.js";
import type * as validators from "../validators.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import { anyApi, componentsGeneric } from "convex/server";

const fullApi: ApiFromModules<{
  apiCommands: typeof apiCommands;
  auth: typeof auth;
  authActions: typeof authActions;
  authCrypto: typeof authCrypto;
  completions: typeof completions;
  crons: typeof crons;
  domain: typeof domain;
  http: typeof http;
  httpHelpers: typeof httpHelpers;
  recurrences: typeof recurrences;
  scheduling: typeof scheduling;
  settings: typeof settings;
  tasks: typeof tasks;
  time: typeof time;
  validators: typeof validators;
}> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
> = anyApi as any;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
> = anyApi as any;

export const components = componentsGeneric() as unknown as {};
