// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   transition.js                                      :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 16:00:20 by jeportie          #+#    #+#             //
//   Updated: 2025/08/22 17:09:42 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * @typedef {"slide" | "fade" | "zoom" | "none"} Variant
 */

/**
 * Create a route transition handler that toggles CSS classes to animate
 * page changes. You can override the variant per navigation by passing
 * state to history (ex: `router.navigateTo(url, { state: { trans: "fade" } })`).
 *
 * Expected CSS (example):
 * - Base classes toggled by JS:
 *   - `route-leave`, `route-leave-active`, `route-enter`, `route-enter-active`
 * - Variant exposed via `[data-trans="slide" | "fade" | "zoom"]` selector
 *   so your CSS can style transitions differently per variant.
 *
 * @param {Variant} [defaultVariant="slide"] - Fallback transition variant.
 * @returns {(el: HTMLElement, phase: "out" | "in") => Promise<void>} A function that runs the transition for the given element and phase.
 */
export function createRouteTransition(defaultVariant = "slide") {
    /**
     * Run a transition phase on an element.
     *
     * @param {HTMLElement} el - The container element to animate (e.g., your #app).
     * @param {"out" | "in"} phase - Whether we're animating the old view out or the new view in.
     * @returns {Promise<void>} Resolves when the CSS transition ends (or immediately for "none").
     */
    return function transition(el, phase) {
        // Read per-navigation override from history.state
        /** @type {{ trans?: Variant } | null} */
        const state = /** @type {any} */ (history.state);
        /** @type {Variant} */
        const variant = (state && state.trans) ? state.trans : defaultVariant;

        // Expose variant to CSS so you can style per-variant transitions
        el.setAttribute("data-trans", variant);

        // No animation requested
        if (variant === "none") {
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            const end = () => {
                el.removeEventListener("transitionend", end);
                resolve();
            };

            if (phase === "out") {
                // Prepare OUT phase
                el.classList.remove("route-enter", "route-enter-active");
                el.classList.add("route-leave");

                // Next frame: activate transition
                requestAnimationFrame(() => {
                    el.classList.add("route-leave-active");
                    el.addEventListener("transitionend", end, { once: true });
                });
            } else {
                // Prepare IN phase
                el.classList.remove("route-leave", "route-leave-active");
                el.classList.add("route-enter");

                // Next frame: activate transition
                requestAnimationFrame(() => {
                    el.classList.add("route-enter-active");
                    el.addEventListener("transitionend", end, { once: true });
                });
            }
        });
    };
}

