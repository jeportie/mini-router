// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   index.js                                           :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 17:23:51 by jeportie          #+#    #+#             //
//   Updated: 2025/09/15 14:06:53 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Public API
export { default as Router } from "./router/Router.js";

// Web Component
export { defineMiniRouter } from "./wc/mini-router.js";

// Base classes
export { default as AbstractView } from "./views/AbstractView.js";
export { default as AbstractLayout } from "./views/AbstractLayout.js";
export { default as AbstractAnimationHook } from "./transitions/AbstractAnimationHook.js";
export { getMaxTransitionMs } from "./transitions/time/getMaxTransitionMs.js";
