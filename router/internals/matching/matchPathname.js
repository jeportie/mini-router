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
    for (const r of routes) {
        const m = pathname.match(r.regex);
        if (!m) continue;
        const values = m.slice(1);
        const params = {};
        r.keys.forEach((k, i) => { params[k] = decodeURIComponent(values[i] ?? ""); });
        return { route: r, params };
    }
    return null;
}
