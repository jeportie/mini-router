// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   routerTools.js                                     :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: jeportie <jeportie@42.fr>                  +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2025/08/21 15:09:58 by jeportie          #+#    #+#             //
//   Updated: 2025/08/21 15:16:29 by jeportie         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //

export function pathToRegex(path) {
    if (path === "*") return { regex: /.*/u, keys: [], isCatchAll: true };

    const keys = [];
    const pattern =
        "^" +
        path
            .replace(/\//g, "\\/")
            .replace(/:(\w+)/g, (_m, k) => {
                keys.push(k);
                return "([^\\/]+)";
            }) +
        "$";

    return { regex: new RegExp(pattern, "u"), keys, isCatchAll: false };
}

export function normalize(path) {
    return path !== "/" ? path.replace(/\/+$/, "") : "/";
}

export function parseQuery(search) {
    return Object.fromEntries(new URLSearchParams(search).entries());
}
