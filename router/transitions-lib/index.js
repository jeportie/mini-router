// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   index.js                                           :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/23 22:47:20 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 22:48:46 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import { noopEngine } from "./noopEngine.js";

/**
 * Users can pass:
 *  - a function (el, phase)               -> wrap to engine
 *  - an engine object { run(...) }        -> use as-is
 *  - a spec { engine:"name", ...options } -> resolve via registry
 */
export function toEngine(value, registry = {}) {
    if (!value) return noopEngine();

    // case: plain function
    if (typeof value === "function") {
        return {
            name: "fn",
            run(el, phase, _ctx) { return Promise.resolve(value(el, phase)); }
        };
    }

    // case: engine object
    if (value && typeof value.run === "function") {
        return value;
    }

    // case: spec { engine: "tailwind", ...opts }
    if (value && typeof value === "object" && typeof value.engine === "string") {
        const factory = registry[value.engine];
        if (!factory) {
            console.warn(`[router] unknown engine "${value.engine}", using noop.`);
            return noopEngine();
        }
        return factory(value); // factory can read extra options from the spec
    }

    return noopEngine();
}

/**
 * Resolve effective engine for a navigation:
 * priority: history.state.trans > route.transition > routerDefault
 */
export function pickEngine({ routerDefault, routeMeta, navStateSpec, registry }) {
    if (navStateSpec) return toEngine(navStateSpec, registry);
    if (routeMeta) return toEngine(routeMeta, registry);
    return toEngine(routerDefault, registry);
}
