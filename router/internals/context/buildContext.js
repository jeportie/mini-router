// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   buildContext.js                                    :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 17:43:34 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 18:20:49 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { parseQuery } from "../routing.js";

/**
 * Build the view context from URL parts and history state.
 * Only touches `window.location` and `history.state`.
 * @param {string} pathname
 * @param {Record<string,string>} params
 */
export function buildContext(pathname, params) {
    return {
        path: pathname,
        params,
        query: parseQuery(window.location.search),
        hash: (window.location.hash || "").replace(/^#/, ""),
        state: history.state,
    };
}
