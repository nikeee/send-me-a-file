import * as qrcode from "qrcode";
import { bgWhite, black } from "colors";

export function terminal(content: string): Promise<string> {
	return new Promise((res, rej) => {

		qrcode.toString(content, (err, qr) => {
			if (err) return rej(rej);

			const text = bgWhite(black(qr));
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
