// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   wcEngine.js                                        :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 22:56:48 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 22:57:32 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

export function wcEngine(tag = "page-transition") {
    return {
        name: "wc",
        async run(el, phase, ctx) {
            let overlay = el.querySelector(tag);
            if (!overlay) {
                overlay = document.createElement(tag);
                overlay.style.position = "absolute";
                overlay.style.inset = "0";
                overlay.style.pointerEvents = "none";
                el.appendChild(overlay);
            }
            // assume the element exposes playIn()/playOut()
            if (phase === "out" && overlay.playOut) await overlay.playOut(ctx);
            if (phase === "in" && overlay.playIn) await overlay.playIn(ctx);
        }
    };
}
