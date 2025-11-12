// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   setup.js                                           :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/11/10 15:22:52 by jeportie          #+#    #+#             //
//   Updated: 2025/11/10 15:23:11 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * Setup helper to configure a <mini-router> element in one call.
 * Avoids coupling to app code (no globals, no auth events, etc.).
 */
export function setupMiniRouter(el, {
    routes,
    linkSelector = "[data-link]",
    animationHook,
    logger = console,
    beforeStart = [],
    afterStart = [],
} = {}) {
    if (!el) throw new Error("setupMiniRouter: element is required");
    el.routes = Array.isArray(routes) ? routes : [];
    el.linkSelector = linkSelector;

    el.logger = logger ?? console;

    if (animationHook) el.animationHook = animationHook;
    beforeStart.forEach(fn => el.beforeStart(fn));
    afterStart.forEach(fn => el.afterStart(fn));
    return el; // chainable
}
