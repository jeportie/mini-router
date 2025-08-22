// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   transition.js                                      :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 16:00:20 by jeportie          #+#    #+#             //
//   Updated: 2025/08/22 19:12:00 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * @typedef {"slide" | "fade" | "zoom" | "none"} Variant
 */

/**
 * Parse a CSS time value into milliseconds.
 * Accepts values like "200ms", "0.3s", "0s", "150".
 * Unqualified numbers are treated as seconds for safety (multiplied by 1000).
 * @param {string} s
 * @returns {number} milliseconds
 */
function parseCssTimeToMs(s) {
    const v = String(s || "").trim();
    if (!v) return 0;
    if (v.endsWith("ms")) return parseFloat(v) || 0;
    if (v.endsWith("s")) return (parseFloat(v) || 0) * 1000;
    // Fallback: assume seconds if no unit
    return (parseFloat(v) || 0) * 1000;
}

/**
 * Compute the *maximum* total transition time (duration + delay) in ms
 * for the given element, considering multiple comma-separated values.
 * We pair durations and delays positionally per CSS rules (shorter lists repeat).
 *
 * @param {HTMLElement} el
 * @returns {number} maximum time in milliseconds
 */
function getMaxTransitionMs(el) {
    const cs = getComputedStyle(el);
    const durList = cs.transitionDuration.split(",").map(parseCssTimeToMs);
    const delList = cs.transitionDelay.split(",").map(parseCssTimeToMs);

    const len = Math.max(durList.length, delList.length) || 1;
    let max = 0;
    for (let i = 0; i < len; i++) {
        const dur = durList[i % durList.length] || 0;
        const del = delList[i % delList.length] || 0;
        const total = dur + del;
        if (total > max) max = total;
    }
    return max;
}

/**
 * Create a route transition handler that toggles CSS classes to animate page changes.
 * You can override the variant per navigation by passing state to history:
 *   `router.navigateTo(url, { state: { trans: "fade" } })`
 *
 * Expected CSS (example):
 * - Base classes toggled by JS on the mount element (e.g., #app):
 *   - `route-leave`, `route-leave-active`, `route-enter`, `route-enter-active`
 * - Variant is exposed via `[data-trans="slide" | "fade" | "zoom"]` so your
 *   CSS can style transitions differently per variant.
 *
 * Safety:
 * - Resolves even if there is no CSS transition (0ms), preventing deadlocks.
 *
 * @param {Variant} [defaultVariant="slide"] Fallback transition variant.
 * @returns {(el: HTMLElement, phase: "out" | "in") => Promise<void>} Transition function.
 */
export function createRouteTransition(defaultVariant = "slide") {
    /**
     * Run a single transition phase on an element.
     *
     * @param {HTMLElement} el The container element to animate (e.g., your #app).
     * @param {"out" | "in"} phase Whether we're animating the old view out or the new view in.
     * @returns {Promise<void>} Resolves when the CSS transition ends (or immediately if none).
     */
    return function transition(el, phase) {
        // Read per-navigation override from history.state
        /** @type {{ trans?: Variant } | null} */
        const state = /** @type {any} */ (history.state);
        /** @type {Variant} */
        const variant = (state && state.trans) ? state.trans : defaultVariant;

        // Expose variant to CSS so you can style per-variant transitions
        el.setAttribute("data-trans", variant);

        // If no animation requested, ensure classes are clean and resolve immediately
        if (variant === "none") {
            el.classList.remove(
                "route-enter",
                "route-enter-active",
                "route-leave",
                "route-leave-active"
            );
            return Promise.resolve();
        }

        return new Promise((resolve) => {
            let done = false;
            /** Ensure we only resolve once, and clean up classes for the phase. */
            const finish = () => {
                if (done) return;
                done = true;
                el.removeEventListener("transitionend", onEnd);

                // Clear active classes for whichever phase ran
                if (phase === "out") {
                    el.classList.remove("route-leave", "route-leave-active");
                } else {
                    el.classList.remove("route-enter", "route-enter-active");
                }
                resolve();
            };

            const onEnd = (evt) => {
                // Only finish on transitions that target the element itself (not children)
                if (evt.target === el) finish();
            };

            // Compute a fallback timeout equal to the maximum transition on the element.
            const totalMs = getMaxTransitionMs(el);

            // Phase toggling
            if (phase === "out") {
                // Prepare OUT phase
                el.classList.remove("route-enter", "route-enter-active");
                el.classList.add("route-leave");

                // Next frame: activate transition
                requestAnimationFrame(() => {
                    el.classList.add("route-leave-active");
                    el.addEventListener("transitionend", onEnd, { once: true });

                    // If no transition is actually applied, resolve on the next frame
                    if (totalMs === 0) {
                        requestAnimationFrame(finish);
                    } else {
                        // Safety timeout (totalMs + tiny buffer)
                        setTimeout(finish, totalMs + 50);
                    }
                });
            } else {
                // Prepare IN phase
                el.classList.remove("route-leave", "route-leave-active");
                el.classList.add("route-enter");

                // Next frame: activate transition
                requestAnimationFrame(() => {
                    el.classList.add("route-enter-active");
                    el.addEventListener("transitionend", onEnd, { once: true });

                    if (totalMs === 0) {
                        requestAnimationFrame(finish);
                    } else {
                        setTimeout(finish, totalMs + 50);
                    }
                });
            }
        });
    };
}

