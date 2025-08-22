// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   AbstractView.js                                    :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/14 18:36:41 by jeportie          #+#    #+#             //
//   Updated: 2025/08/22 17:33:10 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * View context passed to each view instance by the router.
 * Contains information about the current navigation state.
 *
 * @typedef {Object} ViewCtx
 * @property {string} path - The matched route path (e.g. "/posts/123").
 * @property {Object.<string, string>} params - Route params extracted from dynamic segments (e.g. `{ id: "123" }`).
 * @property {Object.<string, string>} query - Query parameters (e.g. `{ search: "foo" }`).
 * @property {string} hash - The hash fragment from the URL (e.g. "#section1").
 * @property {*} state - Arbitrary state object passed through navigation.
 */

/**
 * Base class for all views in the router system.
 * A view is tied to a route and responsible for rendering
 * HTML, binding events, and cleaning up when destroyed.
 */
export default class AbstractView {
    /** @type {ViewCtx} */
    #ctx;

    /**
     * @param {ViewCtx} ctx - Context provided by the router
     */
    constructor(ctx) {
        this.#ctx = ctx;
        console.log(this.#ctx);
    }

    /**
     * Read-only access to the view context.
     * @returns {ViewCtx}
     */
    get ctx() {
        return this.#ctx;
    }

    /**
     * Change the document title.
     * Useful for per-view page titles.
     *
     * @param {string} title - New title
     */
    setTitle(title) {
        document.title = title;
    }

    /**
     * Return the HTML content of the view.
     * Should be overridden by subclasses.
     *
     * @example
     * async getHTML() {
     *   return "<h1>Dashboard</h1>";
     * }
     *
     * @returns {Promise<string>}
     */
    async getHTML() {
        return ("");
    }

    /**
     * Called after the view’s HTML has been inserted into the DOM.
     * Bind event listeners, initialize widgets, etc. here.
     */
    mount() { }

    /**
     * Called before the view is destroyed.
     * Cleanup timers, sockets, and event listeners here.
     */
    destroy() { }
}

