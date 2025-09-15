// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   AbstractLayout.js                                  :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 14:08:13 by jeportie          #+#    #+#             //
//   Updated: 2025/08/22 17:33:19 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * Base class for layouts.
 * Layouts wrap views and provide a common HTML structure
 * (e.g. header, sidebar, footer) with a placeholder slot
 * for the current routed view.
 */
export default class AbstractLayout {
    /** @type {*} */
    #ctx;

    /**
     * @param {*} ctx - Optional context passed by the router
     */
    constructor(ctx) {
        this.#ctx = ctx;
    }

    /**
     * Read-only access to the layout context.
     * Useful for sharing state or router info across the layout.
     * @returns {*}
     */
    get ctx() {
        return (this.#ctx);
    }

    /**
     * Returns the HTML string of the layout.
     * Must contain a `<!-- router-slot -->` comment where the routed view will be injected.
     *
     * @example
     * return `
     *   <header>My App</header>
     *   <main><!-- router-slot --></main>
     *   <footer>Footer</footer>
     * `;
     *
     * @returns {Promise<string>}
     */
    async getHTML() {
        return ("<!-- router-slot -->");
    }

    /**
     * Bind DOM events after the layout has been inserted into the DOM.
     * Override in child classes to attach event listeners.
     */
    mount() { }

    /**
     * Cleanup timers, sockets, or event listeners before the layout is destroyed.
     * Override in child classes to implement custom cleanup logic.
     */
    destroy() { console.debug?.("[Layout] destroy() called"); }
}
