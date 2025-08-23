// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   AbstractAnimationHook.js                           :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/24 01:30:51 by jeportie          #+#    #+#             //
//   Updated: 2025/08/24 01:40:09 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

export default class AbstractAnimationHook {
    /**
     * Default: hard swap (no animation).
     * Hooks can override this to implement any animation.
     */
    async mount({ helpers }) {
        helpers.teardown();
        await helpers.commit();
    }
}
