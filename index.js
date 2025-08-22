// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   index.js                                           :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 17:23:51 by jeportie          #+#    #+#             //
//   Updated: 2025/08/22 17:25:18 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Public API
export { default as Router } from "./router/Router.js";
export { createRouteTransition } from "./router/transition.js";

// Web Component
export { defineMiniRouter } from "./wc/mini-router.js";

export { default as AbstractView } from "./views/AbstractView.js";
export { default as AbstractLayout } from "./views/layouts/AbstractLayout.js";
