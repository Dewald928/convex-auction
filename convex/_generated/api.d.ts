/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as auctionEvents from "../auctionEvents.js";
import type * as auctions from "../auctions.js";
import type * as auth from "../auth.js";
import type * as autobids from "../autobids.js";
import type * as bids from "../bids.js";
import type * as coupons from "../coupons.js";
import type * as crons from "../crons.js";
import type * as http from "../http.js";
import type * as myFunctions from "../myFunctions.js";
import type * as notifications from "../notifications.js";
import type * as scheduledNotifications from "../scheduledNotifications.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  auctionEvents: typeof auctionEvents;
  auctions: typeof auctions;
  auth: typeof auth;
  autobids: typeof autobids;
  bids: typeof bids;
  coupons: typeof coupons;
  crons: typeof crons;
  http: typeof http;
  myFunctions: typeof myFunctions;
  notifications: typeof notifications;
  scheduledNotifications: typeof scheduledNotifications;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
