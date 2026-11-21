import type { RequestHandler } from 'express';
/** Query/body contracts describe existing endpoints; runtime validation stays in controllers. */
export type Query = Record<string, string | undefined>;
export type Handler<Body = Record<string, never>, Q = Query> = RequestHandler<Record<string, string>, unknown, Body, Q>;
