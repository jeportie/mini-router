// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   parseCssTimeToMs.js                                :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 16:03:52 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 18:06:16 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * Parse a CSS time value into milliseconds.
 * Accepts values like "200ms", "0.3s", "0s", "150".
 * Unqualified numbers are treated as seconds for safety (multiplied by 1000).
 * @param {string} s
 * @returns {number} milliseconds
 */
export function parseCssTimeToMs(s) {
    const v = String(s || "").trim();
    if (!v) return 0;
    if (v.endsWith("ms")) return parseFloat(v) || 0;
    if (v.endsWith("s")) return (parseFloat(v) || 0) * 1000;
    // Fallback: assume seconds if no unit
    return (parseFloat(v) || 0) * 1000;
}
