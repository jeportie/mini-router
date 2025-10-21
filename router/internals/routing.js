// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   routing.js                                         :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 18:17:27 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 23:19:32 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

export function pathToRegex(path) {
    if (path === "*") return { regex: /.*/u, keys: [], isCatchAll: true };

    const keys = [];
    const pattern =
        "^" +
        path
            .replace(/\//g, "\\/")
            .replace(/:(\w+)/g, (_m, k) => {
                keys.push(k);
                return "([^\\/]+)";
            }) +
        "$";

    return { regex: new RegExp(pattern, "u"), keys, isCatchAll: false };
}

export function normalize(path) {
    return path !== "/" ? path.replace(/\/+$/, "") : "/";
}

export function parseQuery(search) {
    return Object.fromEntries(new URLSearchParams(search).entries());
}

/**
 * Expand a nested route tree into a flat list with absolute full paths and parent chain.
 * Child paths may be relative ("posts/:id") or absolute ("/posts/:id").
 *
 * @param {RouteDef[]} routes
 * @param {string} base
 * @param {Array<Object>} parents
 * @returns {Array<Object>}
 */
export function expandRoutes(routes, base = "/", parents = []) {
    /** @type {Array<Object>} */
    const out = [];

    for (const r of routes) {
        const isAbs = typeof r.path === "string" && r.path.startsWith("/");
        const raw = isAbs ? r.path : (base === "/" ? `/${r.path}` : `${base}/${r.path}`);
        const full = normalize(raw);

        const entry = {
            path: r.path,
            fullPath: full,
            view: r.view,
            component: r.component,
            layout: r.layout,
            beforeEnter: r.beforeEnter,
            transition: r.transition,
            animationHook: r.animationHook,
            parents, // keep current chain (shallow)
            children: r.children,
        };
        out.push(entry);

        if (Array.isArray(r.children) && r.children.length > 0) {
            out.push(...expandRoutes(r.children, full, [...parents, entry]));
        }
    }
    return (out);
}

/**
 * Ensure we have a class/constructor from a direct class or a lazy loader.
 * Accepts:
 *   - class/function (constructor) directly
 *   - () => import('...') (module with default export)
 * @param {any|(()=>Promise<any>)} maybe
 * @returns {Promise<any|null>}
 */

export async function ensureComponent(maybe) {
    if (!maybe)
        return (null);
    // Heuristic: treat zero-arg functions as lazy loaders
    if (typeof maybe === "function" && maybe.length === 0) {
        // 🧠 cache module resolutions so dynamic imports are stable
        if (!ensureComponent._cache) ensureComponent._cache = new WeakMap();
        if (ensureComponent._cache.has(maybe)) {
            return ensureComponent._cache.get(maybe);
        }

        const mod = await maybe();
        const ctor = mod?.default ?? mod;
        ensureComponent._cache.set(maybe, ctor);
        return ctor;
    }
    return maybe;
}

/**
 * Run guards on parent chain then leaf route.
 * Each guard may return:
 *  - false        -> block navigation
 *  - string path  -> redirect to that path
 *  - void/true    -> continue
 * @param {Array<any>} parents
 * @param {any} leaf
 * @param {any} ctx
 * @returns {Promise< { action:"continue" } | { action:"block" } | { action:"redirect", to:string } >}
 */
export async function runGuards(parents, leaf, ctx) {
    const chain = [...parents, leaf];

    for (const r of chain) {
        if (!r?.beforeEnter)
            continue;

        const res = r.beforeEnter(ctx);
        const out = (res && typeof res.then === "function") ? await res : res;

        if (out === false)
            return ({ action: "block" });
        if (typeof out === "string")
            return ({ action: "redirect", to: out });
    }
    return ({ action: "continue" });
}
