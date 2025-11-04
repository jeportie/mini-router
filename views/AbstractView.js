// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   AbstractView.js                                    :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/14 18:36:41 by jeportie          #+#    #+#             //
//   Updated: 2025/11/04 09:18:37 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

/**
 * Base class for all views in the SPA router system.
 * Handles:
 *  - Route context
 *  - Lifecycle hooks (mount/destroy)
 *  - Cleanup registration
 *  - Task orchestration (init, ready, teardown)
 */

export default class AbstractView {
    /** @type {ViewCtx} */
    #ctx;

    /** @type {(() => void)[]} */
    #cleanups = [];

    constructor(ctx) {
        this.#ctx = ctx;
        console.debug?.("[View] Created:", ctx);
    }

    /** Read-only context accessor */
    get ctx() {
        return this.#ctx;
    }

    /** Register a cleanup callback to run on destroy */
    addCleanup(fn) {
        this.#cleanups.push(fn);
    }

    /** Change the document title */
    setTitle(title) {
        document.title = title;
    }

    /** Subclasses should override this to return their HTML */
    async getHTML() {
        return "";
    }

    /**
     * Hook: override or call in subclasses.
     * This runs before ready, for setup logic.
     */
    async onInit(_context) { }

    /**
     * Hook: override or call in subclasses.
     * Runs after the HTML is in the DOM and init is done.
     */
    async onReady(_context) { }

    /**
     * Hook: override or call in subclasses.
     * Runs before cleanup — for global teardown logic.
     */
    async onTeardown(_context) { }


    /** Register a named subcomponent for this view (like a table, form, modal, etc.) */
    registerComponent(name, instance) {
        if (!this._components)
            this._components = {};
        this._components[name] = instance;
        if (instance.teardown)
            this.addCleanup(() => instance.teardown());
    }

    /** Retrieve a registered component */
    getComponent(name) {
        return this._components?.[name];
    }

    /**
     * Generic mount lifecycle.
     * Builds runtime context and orchestrates tasks automatically.
     */
    async mount({ tasks, ASSETS } = {}) {
        const context = {
            ASSETS,
            addCleanup: (fn) => this.addCleanup(fn),
            view: this,
        };

        // 🔧 Init tasks
        if (tasks?.init?.length) {
            for (const fn of tasks.init) {
                const result = await fn(context);
                if (result && typeof result === "object") {
                    Object.assign(context, result);
                }
            }
        }

        await this.onInit(context);

        // 🚀 Ready tasks
        if (tasks?.ready?.length) {
            for (const fn of tasks.ready) await fn(context);
        }

        await this.onReady(context);
    }

    /**
     * Replace only the routed outlet content, preserving layout background (canvas, etc.)
     * Adds a small fade transition and resolves when the swap is complete.
     */
    swapContent(html, selector = "[data-router-outlet]") {
        return new Promise((resolve) => {
            const outlet = document.querySelector(selector);
            if (!outlet) {
                console.warn("[swapContent] Outlet not found:", selector);
                return resolve(null);
            }

            // Optional: Tailwind fade transition classes
            outlet.setAttribute("data-trans", "fade");
            outlet.classList.add("route-leave");

            requestAnimationFrame(() => {
                outlet.classList.add("route-leave-active");

                setTimeout(() => {
                    outlet.innerHTML = html;
                    outlet.classList.remove("route-leave", "route-leave-active");

                    outlet.classList.add("route-enter");
                    requestAnimationFrame(() => {
                        outlet.classList.add("route-enter-active");

                        setTimeout(() => {
                            outlet.classList.remove("route-enter", "route-enter-active");
                            resolve(outlet); // ✅ Promise resolved after transition
                        }, 300);
                    });
                }, 300);
            });
        });
    }

    /**
     * Generic destroy lifecycle.
     * Safely executes registered cleanups and teardown tasks.
     */
    async destroy({ tasks } = {}) {
        const teardown = tasks?.teardown ?? [];

        console.log(
            `[${this.constructor.name}] Destroy → cleanups:${this.#cleanups.length}, teardown:${teardown.length}`
        );

        // 🧹 Dynamic cleanups
        for (const fn of this.#cleanups) {
            try {
                fn();
            } catch (err) {
                console.warn(`[${this.constructor.name}] Cleanup error:`, err);
            }
        }

        await this.onTeardown(this.ctx);

        // 🧩 Static teardown tasks
        for (const fn of teardown) {
            try {
                fn();
            } catch (err) {
                console.warn(`[${this.constructor.name}] Teardown error:`, err);
            }
        }

        this.#cleanups = [];
    }
}
