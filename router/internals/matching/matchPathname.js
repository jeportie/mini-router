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
        // 1) longest path first
        const al = a.route.fullPath?.length ?? 0;
        const bl = b.route.fullPath?.length ?? 0;
        if (al !== bl) return bl - al;

        // 2) prefer routes that actually render a view
        const ac = Boolean(a.route.component || a.route.view);
        const bc = Boolean(b.route.component || b.route.view);
        if (ac !== bc) return ac ? -1 : 1;

        // 3) deeper nesting last
        const ap = a.route.parents?.length ?? 0;
        const bp = b.route.parents?.length ?? 0;
        return bp - ap;
    });

    return matches[0];
}

