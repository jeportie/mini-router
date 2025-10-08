// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   Fetch.js                                           :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/09/15 14:12:21 by jeportie          #+#    #+#             //
//   Updated: 2025/09/15 12:31:07 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

function safeJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

/**
 * Generic Fetch wrapper with token & refresh support.
 *
 * - Automatically attaches Bearer tokens if provided.
 * - On 401, calls refreshFn and retries once.
 * - Logs via configurable logger.
 */
export default class Fetch {
    constructor(
        baseURL,
        {
            getToken,
            onToken,
            refreshFn, // should return a boolean (true if refreshed)
            logger = console,
        } = {}
    ) {
        this.baseURL = baseURL;
        this.getToken = getToken;
        this.onToken = onToken;
        this.refreshFn = refreshFn;
        this.logger = logger;
    }

    get(endpoint, opts) {
        return this.#send("GET", endpoint, undefined, opts);
    }
    post(endpoint, body, opts) {
        return this.#send("POST", endpoint, body, opts);
    }
    put(endpoint, body, opts) {
        return this.#send("PUT", endpoint, body, opts);
    }
    delete(endpoint, body, opts) {
        return this.#send("DELETE", endpoint, body, opts);
    }

    async #send(method, endpoint, body, opts = {}) {
        const headers = { ...(opts.headers || {}) };
        if (body !== undefined && method !== "GET" && method !== "HEAD") {
            headers["Content-Type"] = "application/json";
        }

        // Attach Bearer token if present
        const token = this.getToken?.();
        if (token) {
            headers["Authorization"] = `Bearer ${token}`;
        }

        const init = { method, headers, credentials: "include" };
        if (body !== undefined && method !== "GET" && method !== "HEAD") {
            init.body = JSON.stringify(body);
        }

        this.logger.info?.("[Fetch] Sending", method, endpoint);
        let res = await fetch(this.baseURL + endpoint, init);
        this.logger.info?.("[Fetch] Response", res.status, endpoint);
        let text = await res.text();
        let data = text ? safeJson(text) : null;

        // On 401 → try refresh once
        if (res.status === 401 && !endpoint.startsWith("/auth/")) {
            this.logger.warn?.("[Fetch] 401 received, trying refresh...");
            const refreshed = await this.#tryRefresh();
            if (refreshed) {
                // retry original request with updated token
                const retryHeaders = { ...headers };
                const newTok = this.getToken?.();
                if (newTok) retryHeaders["Authorization"] = `Bearer ${newTok}`;
                res = await fetch(this.baseURL + endpoint, { ...init, headers: retryHeaders });
                text = await res.text();
                data = text ? safeJson(text) : null;

                if (!res.ok) {
                    const err2 = new Error((data?.error) || res.statusText || "Request failed");
                    err2.status = res.status;
                    err2.data = data;
                    throw err2;
                }
                return data;
            }
        }

        if (!res.ok) {
            const backendError =
                (data && (data.message || data.error)) || res.statusText || "Request failed";

            const err = new Error(backendError);
            err.status = res.status;
            err.code = data?.code || "HTTP_ERROR";
            err.error = data?.error || data?.message || backendError;
            err.message = backendError; // ensure .message always has readable info
            err.data = data;
            throw err;
        }


        return data;
    }

    async #tryRefresh() {
        try {
            const ok = await this.refreshFn?.();
            if (ok) {
                this.logger.info?.("[Fetch] Refresh succeeded");
                return true;
            }
            this.logger.warn?.("[Fetch] RefreshFn returned false");
            this.onToken?.(null);
            window.dispatchEvent(new CustomEvent("auth:logout", { detail: { reason: "refresh_failed" } }));
            return false;
        } catch (err) {
            this.logger.error?.("[Fetch] Refresh exception:", err);
            this.onToken?.(null);
            window.dispatchEvent(new CustomEvent("auth:logout", { detail: { reason: "refresh_exception" } }));
            return false;
        }
    }
}
