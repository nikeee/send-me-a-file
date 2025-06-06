import fs from "node:fs/promises";
import type { NetworkInterfaceInfo } from "node:os";
import * as path from "node:path";

import type { Request } from "restify";


const cliUserAgentStarts = [
	"curl/",
	"Wget/",
	"HTTPie/",
]
export function isRequestingFromBrowser(req: Request): boolean {
	const ua = req.userAgent();
	return !cliUserAgentStarts.some(prefix => ua.startsWith(prefix));
}

export function isLoopback(iface: NetworkInterfaceInfo): boolean {
	return !!(iface.cidr ?.endsWith("/8") && iface.cidr ?.startsWith("127."));
}

export function readPublicFile(fileName: string): Promise<string> {
	const localPath = path.join(__dirname, "..", "public", fileName);
	return fs.readFile(localPath, { encoding: "utf8" });
}

export function indentText(text: string, char = "\t", amount = 1): string {
	const indent = char.repeat(amount);
	return text
		.split("\n")
		.map(l => indent + l)
		.join("\n");
}

export type Protocol = "http" | "https";

export function getServerUrlFromRequest(protocol: Protocol, req: Request, token: string, defaultIncludingPort: string): string {
	const hostHeader = req.headers.host;

	if (hostHeader) {
		const hostHeaderWithoutTrailingSlash = hostHeader.trimRight().replace(/\/+$/, "") // See: https://stackoverflow.com/a/6680877

		return `${protocol}://${hostHeaderWithoutTrailingSlash}/${token}`;
	}
	return `${protocol}://${defaultIncludingPort}`;
}

/**
 * Does not contain chars like 1/i/I/l and o/0/O
 */
const charset = "abcdefghjkmnpqrstuvwxyz123456789";

export function randomString(length: number = 8) {
	const res = new Array(length);

	for (let i = 0; i < res.length; ++i) {
		const c = charset[(Math.random() * charset.length) | 0];
		res[i] = c;
	}
	return res.join("");
}

