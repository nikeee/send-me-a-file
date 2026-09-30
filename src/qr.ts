import * as qrcode from "qrcode";
import { styleText } from "node:util";

export function terminal(content: string): Promise<string> {
	return new Promise((res, rej) => {

		qrcode.toString(content, (err, qr) => {
			if (err) return rej(rej);

			const text = styleText(["bgWhite", "black"], qr);
			return res(text);
		});
	});
}

export type DataUrl = string;
export function dataUrl(content: string): Promise<DataUrl> {
	return new Promise((res, rej) => {

		qrcode.toDataURL(content, (err, qr) => {
			if (err) return rej(rej);
			return res(qr);
		});
	});
}
