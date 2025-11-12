// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   routing.js                                         :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 18:17:27 by jeportie          #+#    #+#             //
//   Updated: 2025/11/11 14:25:04 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * Convert a path pattern ("/user/:id") into a regex matcher.
 */
export function pathToRegex(path, logger = console) {
    const log = logger.withPrefix?.("[Routing]") ?? logger;

    if (path === "*")
        return { regex: /.*/u, keys: [], isCatchAll: true };

    const keys = [];

    const pattern =
        "^" +
        path
            .replace(/\//g, "\\/")
            .replace(/:(\\w+)/g, (_m, k) => {
                keys.push(k);
                return "([^\\/]+)";
            }) +
        "$";

    log.debug?.("Compiled path:", path, "→ keys:", keys);

    return { regex: new RegExp(pattern, "u"), keys, isCatchAll: false };
}

/**
 * Normalize trailing slashes in a path.
 */
export function normalize(path, logger = console) {
    const log = logger.withPrefix?.("[Routing]") ?? logger;
    const normalized = path !== "/" ? path.replace(/\/+$/, "") : "/";

    log.debug?.("Normalized path:", path, "→", normalized);
    return normalized;
}

/**
 * Parse the query string into a key-value object.
 */
export function parseQuery(search, logger = console) {
    const log = logger.withPrefix?.("[Routing]") ?? logger;
    const result = Object.fromEntries(new URLSearchParams(search).entries());

    log.debug?.("Parsed query:", result);
    return result;
}

/**
 * Expand a nested route tree into a flat list with absolute full paths and parent chain.
 *
 * @param {RouteDef[]} routes
 * @param {string} base
 * @param {Array<Object>} parents
 * @param {Console} logger
 * @returns {Array<Object>}
 */
export function expandRoutes(routes, base = "/", parents = [], logger = console) {
    const log = logger.withPrefix?.("[Routing]") ?? logger;

    /** @type {Array<Object>} */
    const out = [];

    for (const r of routes) {
        const isAbs = typeof r.path === "string" && r.path.startsWith("/");

        const raw = isAbs
            ? r.path
            : base === "/"
                ? `/${r.path}`
                : `${base}/${r.path}`;

        const full = normalize(raw, logger);

        const entry = {
            path: r.path,
            fullPath: full,
            view: r.view,
            component: r.component,
            layout: r.layout,
            beforeEnter: r.beforeEnter,
            transition: r.transition,
            animationHook: r.animationHook,
            parents,
            children: r.children,
        };

        out.push(entry);
        log.debug?.("Expanded route:", full);

        if (Array.isArray(r.children) && r.children.length > 0)
            out.push(...expandRoutes(r.children, full, [...parents, entry], logger));
    }

    return out;
}

/**
 * Ensure we have a class/constructor from a direct class or a lazy loader.
 *
 * @param {any|(()=>Promise<any>)} maybe
 * @param {Console} logger
 * @returns {Promise<any|null>}
 */
export async function ensureComponent(maybe, logger = console) {
    const log = logger.withPrefix?.("[Routing]") ?? logger;

    if (!maybe)
        return null;

    // Treat zero-arg functions as lazy loaders
    if (typeof maybe === "function" && maybe.length === 0) {
        if (!ensureComponent._cache)
            ensureComponent._cache = new WeakMap();

        if (ensureComponent._cache.has(maybe)) {
            log.debug?.("Using cached component import");
            return ensureComponent._cache.get(maybe);
        }

        log.debug?.("Lazy-loading component...");
        const mod = await maybe();
        const ctor = mod?.default ?? mod;

        ensureComponent._cache.set(maybe, ctor);
        log.debug?.("Loaded component:", ctor?.name ?? "(anonymous)");

        return ctor;
    }

    return maybe;
}

/**
 * Run guards on parent chain then leaf route.
 *
 * Each guard may return:
 *  - false        -> block navigation
 *  - string path  -> redirect to that path
 *  - void/true    -> continue
 *
 * @param {Array<any>} parents
 * @param {any} leaf
 * @param {any} ctx
 * @param {Console} logger
 * @returns {Promise<{ action:"continue" } | { action:"block" } | { action:"redirect", to:string }>}
 */
export async function runGuards(parents, leaf, ctx, logger = console) {
    const log = logger.withPrefix?.("[Routing]") ?? logger;
    const chain = [...parents, leaf];

    for (const r of chain) {
        if (!r?.beforeEnter)
            continue;

        log.debug?.("Executing guard for:", r.fullPath ?? r.path);

        const res = r.beforeEnter(ctx);
        const out = (res && typeof res.then === "function") ? await res : res;

        if (out === false) {
            log.warn?.("Guard blocked navigation:", r.fullPath ?? r.path);
            return { action: "block" };
        }

        if (typeof out === "string") {
            log.info?.("Guard redirect →", out);
            return { action: "redirect", to: out };
        }
    }

    log.debug?.("Guards passed, continuing...");
    return { action: "continue" };
}

