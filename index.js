// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   index.js                                           :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 17:23:51 by jeportie          #+#    #+#             //
//   Updated: 2025/08/23 23:20:11 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

// Public API
export { default as Router } from "./router/Router.js";

export { tailwindEngine } from "./router/transitions/tailwindEngine.js";
export { noopEngine } from "./router/transitions/noopEngine.js";
export { wcEngine } from "./router/transitions/wcEngine.js";


// Web Component
export { defineMiniRouter } from "./wc/mini-router.js";

export { default as AbstractView } from "./views/AbstractView.js";
export { default as AbstractLayout } from "./views/AbstractLayout.js";
