// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   getMaxTransitionMs.js                              :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 16:04:29 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 18:06:19 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { parseCssTimeToMs } from "./parseCssTimeToMs.js";
/**
 * Compute the *maximum* total transition time (duration + delay) in ms
 * for the given element, considering multiple comma-separated values.
 * We pair durations and delays positionally per CSS rules (shorter lists repeat).
 *
 * @param {HTMLElement} el
 * @returns {number} maximum time in milliseconds
 */
export function getMaxTransitionMs(el) {
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
