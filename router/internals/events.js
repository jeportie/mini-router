// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   events.js                                          :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 17:29:43 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 17:31:16 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * Creates DOM event handlers for popstate and delegated link clicks.
 * @param {{ linkSelector: string, onNavigate: (to:string|symbol)=>void }} deps
 */
export function createHandlers({ linkSelector, onNavigate }) {

    const onPopState = () => onNavigate(Symbol.for("popstate"));

    const onClick = (event) => {
        if (event.defaultPrevented) return;
        if (event.button !== 0) return; // only left-click
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

        const t = event.target;
        if (!(t instanceof Element)) return;

        const linkEl = t.closest(linkSelector);
        if (!linkEl) return;

        if (linkEl.target === "_blank") return;
        if (linkEl.hasAttribute("download")) return;
        if (linkEl.getAttribute("rel") === "external") return;

        const urlObj = new URL(linkEl.href, window.location.origin);
        if (urlObj.origin !== window.location.origin) return;
        if (urlObj.pathname.startsWith("/api/")) return;

        event.preventDefault();
        onNavigate(urlObj.pathname + urlObj.search + urlObj.hash);
    };

    return { onPopState, onClick };
}
