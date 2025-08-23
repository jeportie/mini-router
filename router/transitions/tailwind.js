// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   tailwind.js                                        :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 16:00:20 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 18:08:55 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { getMaxTransitionMs } from "./time/getMaxTransitionMs.js";

export function createRouteTransition(defaultVariant = "fade") {
    return function transition(el, phase) {
        const state = history.state && typeof history.state === "object" ? history.state : null;
        const variant = (state && state.trans) || defaultVariant;

        // expose variant to CSS
        el.setAttribute("data-trans", variant);

        return new Promise((resolve) => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                el.removeEventListener("transitionend", onEnd);
                el.classList.remove(
                    "route-enter", "route-enter-active",
                    "route-leave", "route-leave-active"
                );
                resolve();
            };
            const onEnd = (e) => { if (e.target === el) finish(); };

            // prep phase classes
            if (phase === "out") {
                el.classList.remove("route-enter", "route-enter-active");
                el.classList.add("route-leave");
            } else {
                el.classList.remove("route-leave", "route-leave-active");
                el.classList.add("route-enter");
            }

            // activate next frame
            requestAnimationFrame(() => {
                void el.offsetWidth; // force layout
                el.classList.add(phase === "out" ? "route-leave-active" : "route-enter-active");
                el.addEventListener("transitionend", onEnd, { once: true });
                const total = getMaxTransitionMs(el);
                setTimeout(finish, (total || 0) + 50);
            });
        });
    };
}

