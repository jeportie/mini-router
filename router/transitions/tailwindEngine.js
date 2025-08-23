// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   tailwindEngine.js                                  :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 16:00:20 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 22:46:59 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { getMaxTransitionMs } from "./time/getMaxTransitionMs.js";

export function tailwindEngine(defaultVariant = "fade") {
    return {
        name: "tailwind",
        run(el, phase, ctx) {
            const navState = ctx?.state && typeof ctx.state === "object" ? ctx.state : null;
            const variant = (navState && navState.trans && navState.trans.variant) || defaultVariant;

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

                if (phase === "out") {
                    el.classList.remove("route-enter", "route-enter-active");
                    el.classList.add("route-leave");
                } else {
                    el.classList.remove("route-leave", "route-leave-active");
                    el.classList.add("route-enter");
                }

                requestAnimationFrame(() => {
                    void el.offsetWidth;
                    el.classList.add(phase === "out" ? "route-leave-active" : "route-enter-active");
                    el.addEventListener("transitionend", onEnd, { once: true });
                    const total = getMaxTransitionMs(el);
                    setTimeout(finish, (total || 0) + 50);
                });
            });
        }
    };
}

