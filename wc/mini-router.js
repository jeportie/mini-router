// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   mini-router.js                                     :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/22 17:41:17 by jeportie          #+#    #+#             //
//   Updated: 2025/08/24 01:37:57 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

import Router from "../router/Router.js";
import AbstractAnimationHook from "../transitions/AbstractAnimationHook.js";

export function defineMiniRouter(tagName = "mini-router") {
    if (!customElements.get(tagName)) customElements.define(tagName, MiniRouterElement);
}

class MiniRouterElement extends HTMLElement {
    constructor() {
        super();
        this._router = null;
        this._routes = [];
        this._linkSelector = "[data-link]";
        this._onBeforeNavigate = undefined;
        this._animationHook = new AbstractAnimationHook(); // <—
        this._started = false;
        this._logger = console;
    }

    get logger() {
        return this._logger;
    }

    set logger(v) {
        this._logger = v || console; if (this._router) this._recreate();
    }

    static get observedAttributes() { return ["autostart"]; }
    attributeChangedCallback(name) {
        if (name === "autostart" && this.isConnected && !this._started) this.start();
    }
    connectedCallback() {
        if (!this.id) this.id = "mini-router-" + Math.random().toString(36).slice(2, 8);
        if (this.hasAttribute("autostart")) this.start();
    }
    disconnectedCallback() { this.stop(); }

    start() {
        if (this._started)
            return (Promise.resolve());
        this._ensureRouter();
        this._started = true;
        window.navigateTo = (url, opts = {}) => {
            console.log("[window.navigateTo]", url, opts);
            return this._router.navigateTo(url, opts);
        };
        return (this._router.start());
    }

    stop() { if (!this._started) return; this._router?.stop(); this._started = false; }

    navigateTo(url, opts) { this._router?.navigateTo(url, opts); }

    get routes() { return this._routes; }
    set routes(v) { this._routes = Array.isArray(v) ? v : []; if (this._router) this._recreate(); }

    get linkSelector() { return this._linkSelector; }
    set linkSelector(v) { this._linkSelector = typeof v === "string" ? v : "[data-link]"; if (this._router) this._recreate(); }

    get onBeforeNavigate() { return this._onBeforeNavigate; }
    set onBeforeNavigate(fn) { this._onBeforeNavigate = typeof fn === "function" ? fn : undefined; if (this._router) this._recreate(); }

    get animationHook() { return this._animationHook; }
    set animationHook(h) { this._animationHook = h || new AbstractAnimationHook(); if (this._router) this._recreate(); }

    _ensureRouter() {
        if (this._router) return;
        this._router = new Router({
            routes: this._routes,
            mountSelector: `#${this.id}`,
            linkSelector: this._linkSelector,
            onBeforeNavigate: this._onBeforeNavigate,
            animationHook: this._animationHook,
            logger: this._logger,
        });
    }
    _recreate() {
        const was = this._started;
        this._router?.stop();
        this._router = null; this._started = false;
        if (was) this.start();
    }

    beforeStart(fn) {
        this._ensureRouter();
        this._router.beforeStart(fn);
    }

    afterStart(fn) {
        this._ensureRouter();
        this._router.afterStart(fn);
    }
}

