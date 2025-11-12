// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   events.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 17:29:43 by jeportie          #+#    #+#             //
//   Updated: 2025/11/11 13:41:58 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { logger } from "@system/logger";

const log = logger.withPrefix("[Events]");

/**
 * Creates DOM event handlers for popstate and delegated link clicks.
 *
 * @param {{ linkSelector: string, onNavigate: (to:string|symbol)=>void }} deps
 */
export function createHandlers({ linkSelector, onNavigate }) {
    log.debug?.("Creating event handlers for selector:", linkSelector);

    const onPopState = () => {
        log.debug?.("Detected browser popstate");
        onNavigate(Symbol.for("popstate"));
    };

    const onClick = (event) => {
        if (event.defaultPrevented)
            return;
        if (event.button !== 0)
            return; // only left-click
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
            return;
        const t = event.target;
        if (!(t instanceof Element))
            return;
        const linkEl = t.closest(linkSelector);
        if (!linkEl)
            return;
        // Skip external links or non-SPA interactions
        if (linkEl.target === "_blank")
            return;
        if (linkEl.hasAttribute("download"))
            return;
        if (linkEl.getAttribute("rel") === "external")
            return;
        const urlObj = new URL(linkEl.href, window.location.origin);
        if (urlObj.origin !== window.location.origin)
            return;
        if (urlObj.pathname.startsWith("/api/"))
            return;
        event.preventDefault();
        log.debug?.("Intercepted SPA navigation →", urlObj.pathname);
        onNavigate(urlObj.pathname + urlObj.search + urlObj.hash);
    };
    log.debug?.("Event handlers ready.");
    return { onPopState, onClick };
}
