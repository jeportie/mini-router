// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   matchPathname.js                                   :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 17:42:46 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 17:43:28 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * @typedef {{ regex: RegExp, keys: string[], isCatchAll?: boolean }} CompiledRoute
 * @typedef {{ route: CompiledRoute & any, params: Record<string,string> } | null} Match
 */

/**
 * Deterministically match a pathname against compiled routes.
 * No DOM, no globals.
 * @param {string} pathname
 * @param {CompiledRoute[]} routes
 * @returns {Match}
 */
// router/internals/matching/matchPathname.js
export function matchPathname(pathname, routes) {
    const matches = [];

    for (const r of routes) {
        const m = pathname.match(r.regex);
        if (!m) continue;
        const values = m.slice(1);
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(values[i] ?? ""); });
        matches.push({ route: r, params });
    }

    if (matches.length === 0) return null;

    matches.sort((a, b) => {
        // 0) NEVER pick the catch-all if a specific route matched
        const aCatch = !!a.route.isCatchAll;
        const bCatch = !!b.route.isCatchAll;
        if (aCatch !== bCatch) return aCatch ? 1 : -1;

        // 1) prefer routes that actually render a view
        const aHasView = Boolean(a.route.component || a.route.view);
        const bHasView = Boolean(b.route.component || b.route.view);
        if (aHasView !== bHasView) return aHasView ? -1 : 1;

        // 2) longer fullPath (more specific)
        const al = a.route.fullPath?.length ?? 0;
        const bl = b.route.fullPath?.length ?? 0;
        if (al !== bl) return bl - al;

        // 3) deeper nesting
        const ap = a.route.parents?.length ?? 0;
        const bp = b.route.parents?.length ?? 0;
        return bp - ap;
    });

    return matches[0];
}
